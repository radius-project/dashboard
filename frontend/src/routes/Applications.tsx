import { TableColumn } from "react-data-table-component";
import ResourceView, { extractResourceGroup, extractResourceName, Resource } from "../components/ResourceView";

interface ApplicationProperties {
    environment: string
}

const columns : TableColumn<Resource<ApplicationProperties>>[] = [
  {
      name: 'Name',
      selector: (row: Resource<ApplicationProperties>) => row.name,
      sortable: true,
  },
  {
      name: 'Resource Group',
      selector: (row: Resource<ApplicationProperties>) => extractResourceGroup(row.id) ?? '',
      sortable: true,
  },
  {
    name: 'Environment',
    selector: (row: Resource<ApplicationProperties>) => extractResourceName(row.properties.environment) ?? '',
    sortable: true,
},
];


export default function ApplicationPage() {
  return (
    <>
      <ResourceView 
        columns={columns} 
        heading="Applications"
        resourceType="Applications.Core/applications" 
        selectionMessage="Select an application to display details..."/>
    </>
  );
}