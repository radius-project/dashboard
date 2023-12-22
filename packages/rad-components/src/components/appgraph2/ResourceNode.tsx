import React from "react";
import {Resource} from "../../graph";
import { Handle, Position } from "reactflow";

export type ResourceNodeProps = {
  data: Resource;
};

function ResourceNode(props: ResourceNodeProps) {
  return (
    <>
      <Handle type="target" position={Position.Top} id="a" />
      <div style={{border: '1px solid', padding: '30px', background: '#FFFFFF'}}>
        <h3 style={{textAlign: 'center'}}>{props.data.name}</h3>
        <hr />
        <h5>{props.data.type}</h5>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
};

export default ResourceNode;