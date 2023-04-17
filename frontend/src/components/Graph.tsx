import ReactFlow, { Background, Controls } from 'reactflow';
import { Application } from './ApplicationView';
import 'reactflow/dist/style.css';

function Graph(
    props: {
        application: Application
    }
){
    const nodes = props.application.resources.map((resource, index) => {
        return {
            id: resource.id,
            position: { x: 0, y: index * 100 },
            data: { label: resource.name + ' (' + resource.type + ')' },
        }
    });

    


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
