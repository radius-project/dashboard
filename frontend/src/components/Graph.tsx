import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import { Application } from './ApplicationView';
import 'reactflow/dist/style.css';

import ResourceNode from './nodes/ResourceNode';
import RouteNode from './nodes/RouteNode';

const nodeTypes = {
    resource: ResourceNode,
    route: RouteNode
}

function Graph(
    props: {
        application: Application
    }
) {
    let yOffsetMap: { [key: string]: number } = {};
    let xOffset = 1;
    let yOffset = 1;

    let xScale = 350;
    let yScale = 150;

    let type = 'resource'

    const nodes = props.application.resources.map((resource, index) => {
        if (resource.type === 'Applications.Core/containers') {
            xOffset = 3;
            if (!yOffsetMap[resource.type]) {
                yOffsetMap[resource.type] = 1;
            }
            else {
                yOffsetMap[resource.type] += 1;
            }
            yOffset = yOffsetMap[resource.type];
            type = 'resource';
        }
        else if (resource.type === 'Applications.Core/httpRoutes') {
            type = 'route';
        }
        else if (resource.type === 'Applications.Core/gateways') {
            xOffset = 1;
            yOffset = 1;
            type = 'resource';
        }
        else {
            xOffset = 5;
            if (!yOffsetMap['other']) {
                yOffsetMap['other'] = 1;
            }
            else {
                yOffsetMap['other'] += 1;
            }
            yOffset = yOffsetMap['other'];
            type = 'resource';
        }

        let url = '';
        if (resource.properties.resource) {
            url = 'https://ms.portal.azure.com/#@microsoft.onmicrosoft.com/resource' + resource.properties.resource;
        }


        return {
            id: resource.id,
            position: { x: xOffset * xScale, y: yOffset * yScale },
            type: type,
            data: {
                label: resource.name + ' (' + resource.type + ')',
                name: resource.name,
                type: resource.type,
                url: url,
            },
        }
    });

    const edges = props.application.resources.flatMap((resource) => {
        const connections = resource.properties.connections;
        if (!connections) {
            return [];
        }

        return Object.entries(connections).map(([key, value]) => {
            return {
                id: 'edge-' + resource.name + '-' + key,
                source: resource.id,
                target: value.source,
                arrowHeadType: 'arrowclosed',
                label: key,
            }
        })
    });

    return (
        <div style={{ height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
            >
                <MiniMap />
                <Background />
                <Controls />
            </ReactFlow>
        </div>
    );
}

export default Graph;
