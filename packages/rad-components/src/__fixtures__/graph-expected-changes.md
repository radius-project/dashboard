# Graph expected changes

Every graph record difference during extraction must be declared in this table before the record
is updated. Clear the table at the end of each extraction phase.

| Fixture | Field | Old value | New value | Reason |
| ------- | ----- | --------- | --------- | ------ |
| missing-target | edges.0 | {"source":"/planes/radius/local/resourceGroups/demo/providers/Applications.Datastores/redisCaches/absent","target":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","direction":"source-to-target"} | <absent> | #353: Omit the edge with a missing endpoint and report the connection in the graph warning. |
| unparseable-connection | edges.0 | {"source":"not-a-resource-id","target":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","direction":"source-to-target"} | <absent> | #353: Omit the edge with a missing endpoint and report the connection in the graph warning. |
