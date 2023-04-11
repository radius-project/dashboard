import ReactFlow, { Background, Controls } from 'reactflow';
import { Application } from './ApplicationView';
import 'reactflow/dist/style.css';

function Graph(
    props: {
        appName: string,
    }
){
    const nodes = [
        {
            id: '1',
            position: { x: 0, y: 0 },
            data: { label: props.appName },
        },
    ];
    return (
        <div style={{ height: '100%' }}>
            <ReactFlow nodes={nodes}>
                <Background />
                <Controls />
            </ReactFlow>
        </div>
    );
}

export default Graph;
