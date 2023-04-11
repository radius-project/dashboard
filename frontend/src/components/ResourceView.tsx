import React from "react";
import DataTable, { TableColumn } from 'react-data-table-component';
import { useErrorHandler } from "react-error-boundary";
import RefreshButton from "./RefreshButton";
import Graph from "./Graph";
import "./ResourceView.css"

export interface Resource<TProperties> {
  id: string
  name: string
  type: string
  properties: TProperties
}

export const extractResourceGroup = (id: string): string | null => {
  const parts = id.split('/').filter(v => v.length > 0)
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'providers') {
      return parts[i - 1]
    }
  }

  return null
}

export const extractResourceName = (id: string | undefined): string | null => {
  if (!id) {
    return null;
  }

  const parts = id.split('/').filter(v => v.length > 0)
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'providers') {
      return parts[i + 3]
    }
  }

  return null
}

export default function ResourceView<TProperties>(props: { resourceType: string | undefined, heading: string, selectionMessage: string, columns: TableColumn<Resource<TProperties>>[] }) {
  let [state, setState] = React.useState({ loading: true, applications: [], application: [] })
  const errorHandler = useErrorHandler();

  let [selected, setSelected] = React.useState<Resource<TProperties> | null>(null);

  async function fetchResources() {
    try {
      setState({ loading: true, applications: state.applications, application: state.application })

      let url = '/api/v1/resource/resourceGroups/default/providers/'
      if (props.resourceType && props.resourceType.length > 0) {
        url += encodeURIComponent(props.resourceType);
      }

      const response = await fetch(url)
      const data = await response.json(); 

      setState({ loading: false, applications: data.value, application: state.application })
    } catch (error) {
      errorHandler(error)
    }
  };

  React.useEffect(() => {
    fetchResources();
  }, [])

  const onRowClicked = (row: Resource<TProperties>) => {
    setSelected(row);
  };

  const onRefreshClicked = () => {
    if (state.loading) {
      return
    }

    fetchResources();
  }

  return (
    <>
      <div className="ResourceView-header">
        <h1>{props.heading}</h1>
        <RefreshButton loading={state.loading} onRefreshClicked={onRefreshClicked} />
      </div>
      <div className="ResourceView-main">
        <DataTable
          columns={props.columns}
          data={state.applications}
          onRowClicked={onRowClicked}
        />
      </div>
      <div className="ResourceView-details">
        {!!selected ?
          <p>ENV_VIEW</p> :
          <p className="ResourceView-no-selection">{props.selectionMessage}</p>}
      </div>
    </>
  );
}