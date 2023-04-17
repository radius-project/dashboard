import { TableColumn } from "react-data-table-component";
import ApplicationView, { extractResourceGroup, extractResourceName, Application } from "../components/ApplicationView";

const columns : TableColumn<Application>[] = [
  {
      name: 'Name',
      selector: (row: Application) => row.name,
      sortable: true,
  },
  {
      name: 'Resource Group',
      selector: (row: Application) => extractResourceGroup(row.id) ?? '',
      sortable: true,
  },
  {
    name: 'Environment',
    selector: (row: Application) => extractResourceName(row.properties.environment) ?? '',
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