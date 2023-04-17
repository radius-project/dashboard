import React from "react";
import DataTable, { TableColumn } from 'react-data-table-component';
import { useErrorHandler } from "react-error-boundary";
import RefreshButton from "./RefreshButton";
import Graph from "./Graph";
import "./ApplicationView.css"

interface ResourceProperties {
    environment: string
    provisioningState: string
    status: object
}

interface Resource {
    id: string
    location: string
    name: string
    type: string
    tags: object
    properties: ResourceProperties
    systemData: object
}

export interface Application extends Resource {
    resources: Resource[]
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

export default function ApplicationView(
    props: {
        columns: TableColumn<Application>[]
    }
) {
    let [selected, setSelected] = React.useState<Application | null>(null);

    let [applicationList, setApplicationList] = React.useState<Application[]>([]);
    let [selectedApplication, setApplication] = React.useState<Application | null>(null);
    let [loading, setLoading] = React.useState<boolean>(true);

    const errorHandler = useErrorHandler();

    async function fetchApplications() {
        try {
            setLoading(true)

            let url = '/api/v1/resource/resourceGroups/default/providers/Applications.Core/applications'

            const response = await fetch(url)
            const data = await response.json();

            setApplicationList(data.value)
            setLoading(false)
        } catch (error) {
            errorHandler(error)
        }
    };

    async function fetchApplication(name: string) {
        try {
            setLoading(true)

            let url = '/api/v1/resource/resourceGroups/default/providers/Applications.Core/applications/' + name

            const response = await fetch(url)
            const data = await response.json();

            setApplication(data)
            setLoading(false)
        } catch (error) {
            errorHandler(error)
        }
    }

    React.useEffect(() => {
        fetchApplications();
    }, [])

    const onRowClicked = (row: Application) => {
        fetchApplication(row.name);
        //setSelected(row);
    };

    const onRefreshClicked = () => {
        if (loading) {
            return
        }

        fetchApplications();
    }

    return (
        <>
            <div className="ApplicationView-header">
                <h1>Applications</h1>
                <RefreshButton loading={loading} onRefreshClicked={onRefreshClicked} />
            </div>
            <div className="ApplicationView-main">
                <DataTable
                    columns={props.columns}
                    data={applicationList}
                    onRowClicked={onRowClicked}
                />
            </div>
            <div className="ApplicationView-details">
                {!!selectedApplication ?
                    <Graph
                        application={selectedApplication}
                    /> :
                    <p className="ApplicationView-no-selection">Select an application</p>
                }
            </div>
        </>
    );
}
