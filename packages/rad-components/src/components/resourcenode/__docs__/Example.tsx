import React, { FC } from "react";
import ResourceNode, { ResourceNodeProps } from "../ResourceNode";
import * as sampledata from "../../../sampledata";

const Example: FC<ResourceNodeProps> = ({
  resource = sampledata.ContainerResource,
}) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
      }}
    >
      <ResourceNode resource={resource} />
    </div>
  );
};

export default Example;