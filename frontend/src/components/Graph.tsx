import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

function Graph(
    props: {
        environment: any
    }
){
    const nodes = [
        {
            id: '1',
            position: { x: 0, y: 0 },
            data: { label: props.environment.name },
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
