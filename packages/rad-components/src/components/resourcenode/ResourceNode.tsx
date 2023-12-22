import React from "react";
import {Resource} from "../../graph";

export type ResourceNodeProps = {
  resource: Resource;
};

const ResourceNode: React.FC<ResourceNodeProps> = ({
  resource,
  ...props
}) => {
  return (
    <div className="resource-node" style={{border: '1px solid', padding: '5px'}} {...props}>
      <h3 style={{textAlign: 'center'}}>{resource.name}</h3>
      <hr />
      <h5>{resource.type}</h5>
      <h6>asdsfdsdfafdfdff</h6>
    </div>
  );
};

export default ResourceNode;