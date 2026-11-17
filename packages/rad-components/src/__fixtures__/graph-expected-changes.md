# Graph expected changes

Every graph record difference during extraction must be declared in this table before the record
is updated. Retain the reviewed entries until this branch is merged so GU-25
can compare the committed records with the base commit.

| Fixture | Field | Old value | New value | Reason |
| ------- | ----- | --------- | --------- | ------ |
| duplicate-ids | nodes.1 | <absent> | {"id":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","label":"webapp","type":"Applications.Core/containers","icon":"not-yet-populated","statusBadge":"not-yet-populated"} | Restores the pre-Phase-4 (#429) local renderer record. This branch uses unchanged ai-extensions main libraries, which do not provide the shared parser. |
| missing-target | edges.0 | <absent> | {"source":"/planes/radius/local/resourceGroups/demo/providers/Applications.Datastores/redisCaches/absent","target":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","direction":"source-to-target"} | Restores the pre-Phase-4 (#429) local renderer record. This branch uses unchanged ai-extensions main libraries, which do not provide the shared parser. |
| self-reference | edges.0 | <absent> | {"source":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","target":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","direction":"source-to-target"} | Restores the pre-Phase-4 (#429) local renderer record. This branch uses unchanged ai-extensions main libraries, which do not provide the shared parser. |
| unparseable-connection | edges.0 | <absent> | {"source":"not-a-resource-id","target":"/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/webapp","direction":"source-to-target"} | Restores the pre-Phase-4 (#429) local renderer record. This branch uses unchanged ai-extensions main libraries, which do not provide the shared parser. |
