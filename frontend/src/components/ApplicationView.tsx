import React from "react";
import DataTable, { TableColumn } from 'react-data-table-component';
import { useErrorHandler } from "react-error-boundary";
import RefreshButton from "./RefreshButton";
import Graph from "./Graph";
import "./ApplicationView.css"

export interface Application<TProperties> {
    id: string
    name: string
    type: string
    properties: TProperties
    resources: object[]
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

export default function ApplicationView<TProperties>(
    props: {
        columns: TableColumn<Application<TProperties>>[]
    }
) {
    let [state, setState] = React.useState({ loading: true, applications: [], application: [] })
    const errorHandler = useErrorHandler();

    let [selected, setSelected] = React.useState<Application<TProperties> | null>(null);

    async function fetchApplications() {
        try {
            setState({ loading: true, applications: state.applications, application: state.application })

            let url = '/api/v1/resource/resourceGroups/default/providers/Applications.Core/applications'

            const response = await fetch(url)
            const data = await response.json();

            setState({ loading: false, applications: data.value, application: state.application })
        } catch (error) {
            errorHandler(error)
        }
    };

    async function fetchApplication(name: string) {
        try {
            setState({ loading: true, applications: state.applications, application: state.application })

            let url = '/api/v1/resource/resourceGroups/default/providers/Applications.Core/applications/' + name

            const response = await fetch(url)
            const data = await response.json();

            setState({ loading: false, applications: state.applications, application: data })
        } catch (error) {
            errorHandler(error)
        }
    }

    React.useEffect(() => {
        fetchApplications();
    }, [])

    const onRowClicked = (row: Application<TProperties>) => {
        fetchApplication(row.name);
        setSelected(row);
    };

    const onRefreshClicked = () => {
        if (state.loading) {
            return
        }

        fetchApplications();
    }

    return (
        <>
            <div className="ApplicationView-header">
                <h1>Applications</h1>
                <RefreshButton loading={state.loading} onRefreshClicked={onRefreshClicked} />
            </div>
            <div className="ApplicationView-main">
                <DataTable
                    columns={props.columns}
                    data={state.applications}
                    onRowClicked={onRowClicked}
                />
            </div>
            <div className="ApplicationView-details">
                {!!selected ?
                    <Graph
                        appName='test'
                    /> :
                    <p className="ApplicationView-no-selection">Select an application</p>}
            </div>
        </>
    );
}
