import { TableColumn } from "react-data-table-component";
import ApplicationView, { extractResourceGroup, extractResourceName, Application } from "../components/ApplicationView";

interface ApplicationProperties {
    environment: string
}

const columns : TableColumn<Application<ApplicationProperties>>[] = [
  {
      name: 'Name',
      selector: (row: Application<ApplicationProperties>) => row.name,
      sortable: true,
  },
  {
      name: 'Resource Group',
      selector: (row: Application<ApplicationProperties>) => extractResourceGroup(row.id) ?? '',
      sortable: true,
  },
  {
    name: 'Environment',
    selector: (row: Application<ApplicationProperties>) => extractResourceName(row.properties.environment) ?? '',
    sortable: true,
},
];


export default function ApplicationPage() {
  return (
    <>
      <ApplicationView 
        columns={columns}
      />
    </>
  );
}