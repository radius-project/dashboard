import React from 'react';

const render = jest.fn();
jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({ render })),
}));
jest.mock('./App', () => ({
  __esModule: true,
  default: <div>Native application root</div>,
}));

it('FS-09: renders the createRoot element through the actual entry point', async () => {
  document.body.innerHTML = '<div id="root"></div>';
  await import('./index');
  expect(render).toHaveBeenCalledTimes(1);
  expect(React.isValidElement(render.mock.calls[0][0])).toBe(true);
  expect(render.mock.calls[0][0].props.children).toBe(
    'Native application root',
  );
});
