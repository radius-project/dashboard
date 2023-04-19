import { useCallback } from 'react';
import { Handle, Position } from 'reactflow';

import './RouteNode.css'

const isConnectable = false


function RouteNode(props: {
    data: {
        label: string
        name: string
        type: string
    }
}) {


    const iconUrl = '/api/v1/icon/' + props.data.type;

    return (
        <>
        </>
    )
}

export default RouteNode;
