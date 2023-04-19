import { useCallback } from 'react';
import { Handle, Position } from 'reactflow';

import './ResourceNode.css'

const isConnectable = false


function ResourceNode(props: {
    data: {
        label: string
        name: string
        type: string
    }
}) {


    const iconUrl = '/api/v1/icon/' + props.data.type;

    return (
        <>
            <div className="resource-node">
                <div className="resource-node-circle">
                    <Handle type="target" position={Position.Left} isConnectable={isConnectable} />
                    <img src={iconUrl} alt="resource icon" className="resource-node-icon" />
                </div>
                <div className="resource-node-details">
                    <h3 className='resource-node-title'>{props.data.name}</h3>
                    <p className='resource-node-subtitle'>{props.data.type}</p>
                </div>
                <Handle type="source" position={Position.Right} id="b" isConnectable={isConnectable} />
            </div>
        </>
    )
}

export default ResourceNode;
