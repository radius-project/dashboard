import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { RadiusApi, RadiusApplicationGraph } from '../../api';
import { useApplicationGraph } from './useApplicationGraph';

const application =
  '/planes/radius/local/resourceGroups/group/providers/Applications.Core/applications/app.1';
const secondApplication = application.replace('/app.1', '/app.2');

function response(
  applicationId = application,
  connectionId = 'selected-cluster',
): RadiusApplicationGraph {
  return {
    graph: { name: applicationId, resources: [] },
    context: {
      connectionId,
      plane: { type: 'radius', name: 'local' },
      applicationId,
    },
  };
}

function apiWith(
  getApplicationGraph?: RadiusApi['getApplicationGraph'],
): RadiusApi {
  return {
    getResourceById: jest.fn(),
    listApplications: jest.fn(),
    listEnvironments: jest.fn(),
    listResources: jest.fn(),
    listResourceTypes: jest.fn(),
    getResourceType: jest.fn(),
    getApplicationGraph,
  };
}

function Probe({ api, id = application }: { api: RadiusApi; id?: string }) {
  const { loading, value, error } = useApplicationGraph(api, id);
  if (loading) {
    return <span>Loading graph</span>;
  }
  if (error) {
    return <span role="alert">{error.message}</span>;
  }
  return (
    <span>
      {value?.context.connectionId}:{value?.context.applicationId}
    </span>
  );
}

describe('application graph request lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('CN-07: uses the explicit API override and its real context', async () => {
    const getGraph = jest.fn().mockResolvedValue(response());
    const api = apiWith(getGraph);
    render(<Probe api={api} />);

    expect(
      await screen.findByText(`selected-cluster:${application}`),
    ).toBeVisible();
    expect(getGraph).toHaveBeenCalledWith({
      applicationId: application,
      signal: expect.any(AbortSignal),
    });
    expect(api.getResourceType).not.toHaveBeenCalled();
  });

  it('CN-07: reports an unsupported old override without using a proxy or bypassing the override', async () => {
    const api = apiWith();
    render(<Probe api={api} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The host must provide getApplicationGraph',
    );
    for (const method of [
      api.getResourceById,
      api.getResourceType,
      api.listApplications,
      api.listResourceTypes,
    ]) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['another application', response(secondApplication)],
    [
      'another plane',
      {
        ...response(),
        context: {
          ...response().context,
          plane: { type: 'radius', name: 'other' },
        },
      },
    ],
    ['an empty connection', response(application, '')],
  ])('CN-07: rejects a result with %s', async (_label, result) => {
    render(<Probe api={apiWith(jest.fn().mockResolvedValue(result))} />);
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText(`selected-cluster:${application}`)).toBeNull();
  });

  it('rejects a malformed route before calling the override', async () => {
    const getGraph = jest.fn();
    render(<Probe api={apiWith(getGraph)} id="not-a-resource-id" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'valid UCP application ID',
    );
    expect(getGraph).not.toHaveBeenCalled();
  });

  it('CN-05 / ER-07: aborts the previous route and ignores its late success', async () => {
    let resolveFirst!: (result: RadiusApplicationGraph) => void;
    const getGraph = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<RadiusApplicationGraph>(resolve => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(response(secondApplication));
    const api = apiWith(getGraph);
    const view = render(<Probe api={api} />);
    await waitFor(() => expect(getGraph).toHaveBeenCalledTimes(1));
    const signal: AbortSignal = getGraph.mock.calls[0][0].signal;

    view.rerender(<Probe api={api} id={secondApplication} />);
    expect(signal.aborted).toBe(true);
    expect(
      await screen.findByText(`selected-cluster:${secondApplication}`),
    ).toBeVisible();
    await act(async () => resolveFirst(response()));
    expect(
      screen.getByText(`selected-cluster:${secondApplication}`),
    ).toBeVisible();
    expect(screen.queryByText(`selected-cluster:${application}`)).toBeNull();
  });

  it('CN-05: does not reuse response state across a host API/context replacement', async () => {
    const oldApi = apiWith(jest.fn().mockResolvedValue(response()));
    let resolveNew!: (result: RadiusApplicationGraph) => void;
    const newApi = apiWith(
      jest.fn().mockImplementation(
        () =>
          new Promise<RadiusApplicationGraph>(resolve => {
            resolveNew = resolve;
          }),
      ),
    );
    const view = render(<Probe api={oldApi} />);
    await screen.findByText(`selected-cluster:${application}`);
    view.rerender(<Probe api={newApi} />);
    expect(screen.getByText('Loading graph')).toBeVisible();
    expect(screen.queryByText(`selected-cluster:${application}`)).toBeNull();

    await act(async () => resolveNew(response(application, 'second-cluster')));
    expect(screen.getByText(`second-cluster:${application}`)).toBeVisible();
  });

  it('CN-05 / ER-07: ignores a late failure after API/context replacement', async () => {
    let rejectOld!: (reason: Error) => void;
    const oldGraph = jest.fn().mockImplementation(
      () =>
        new Promise<RadiusApplicationGraph>((_resolve, reject) => {
          rejectOld = reject;
        }),
    );
    const oldApi = apiWith(oldGraph);
    const newApi = apiWith(
      jest.fn().mockResolvedValue(response(application, 'new-cluster')),
    );
    const view = render(<Probe api={oldApi} />);
    view.rerender(<Probe api={newApi} />);
    await screen.findByText(`new-cluster:${application}`);
    expect(oldGraph.mock.calls[0][0].signal.aborted).toBe(true);

    await act(async () => rejectOld(new Error('Old context failed')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(`new-cluster:${application}`)).toBeVisible();
  });

  it('ER-09: stops at 10 seconds even when an override ignores abort and resolves late', async () => {
    jest.useFakeTimers();
    let resolveGraph!: (result: RadiusApplicationGraph) => void;
    const getGraph = jest.fn().mockImplementation(
      () =>
        new Promise<RadiusApplicationGraph>(resolve => {
          resolveGraph = resolve;
        }),
    );
    render(<Probe api={apiWith(getGraph)} />);

    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByRole('alert')).toHaveTextContent('timed out');
    expect(getGraph.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => resolveGraph(response()));
    expect(screen.getByRole('alert')).toHaveTextContent('timed out');
    expect(screen.queryByText(`selected-cluster:${application}`)).toBeNull();
  });

  it('ER-07: aborts the request when the caller unmounts', () => {
    const getGraph = jest.fn().mockReturnValue(new Promise(() => {}));
    const view = render(<Probe api={apiWith(getGraph)} />);
    const signal: AbortSignal = getGraph.mock.calls[0][0].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
