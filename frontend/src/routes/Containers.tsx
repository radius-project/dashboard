import { TableColumn } from "react-data-table-component";
import ResourceView, { extractResourceGroup, extractResourceName, Resource } from "../components/ResourceView";

interface ContainerProperties {
  application: string
  environment: string
}

const columns: TableColumn<Resource<ContainerProperties>>[] = [
  {
    name: 'Name',
    selector: (row: Resource<ContainerProperties>) => row.name,
    sortable: true,
  },
  {
    name: 'Resource Group',
    selector: (row: Resource<ContainerProperties>) => extractResourceGroup(row.id) ?? '',
    sortable: true,
  },
  {
    name: 'Application',
    selector: (row: Resource<ContainerProperties>) => extractResourceName(row.properties.application) ?? '',
    sortable: true,
  },
  {
    name: 'Environment',
    selector: (row: Resource<ContainerProperties>) => extractResourceName(row.properties.environment) ?? '',
    sortable: true,
  },
];


export default function ContainerPage() {
  return (
    <>
      <ResourceView
        columns={columns}
        heading="Containers"
        resourceType="Applications.Core/containers"
        selectionMessage="Select a container to display details..." />
    </>
  );
}