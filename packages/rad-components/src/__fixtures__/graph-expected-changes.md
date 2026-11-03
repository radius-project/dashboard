# Graph expected changes

Every graph record difference during extraction must be declared in this table before the record
is updated. Retain the reviewed entries until this extraction is merged so GU-25
can compare the committed records with the base commit. Clear them when a later
phase starts from that merged baseline, not while the comparison still needs them.

| Fixture | Field | Old value | New value | Reason |
| ------- | ----- | --------- | --------- | ------ |
| duplicate-ids | nodes.1 | {"id":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","label":"webapp","type":"Applications.Core/containers","icon":"not-yet-populated","statusBadge":"not-yet-populated"} | <absent> | #357: coalesce identical duplicate IDs with a diagnostic; retain the unique node. Coordinator reviewed the exact DOM diff. |
| missing-target | edges.0 | {"source":"/planes/radius/local/resourceGroups/demo/providers/Applications.Datastores/redisCaches/absent","target":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","direction":"source-to-target"} | <absent> | #353: omit the dangling edge with a warning; retain its owner. Coordinator reviewed the exact DOM diff. |
| self-reference | edges.0 | {"source":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","target":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","direction":"source-to-target"} | <absent> | #357: omit the self edge with a diagnostic; retain its node. Coordinator reviewed the exact DOM diff. |
| unparseable-connection | edges.0 | {"source":"not-a-resource-id","target":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","direction":"source-to-target"} | <absent> | #353: omit the malformed edge with a warning; retain its owner. Coordinator reviewed the exact DOM diff. |
