from flask import Flask, request, jsonify
from kubernetes import client, config
import os
import requests
from functools import lru_cache

app = Flask(__name__)

if 'KUBERNETES_SERVICE_HOST' in os.environ:
    print('Using in-cluster config')
    config.load_incluster_config()
else:
    print('Using kube-config locally')
    config.load_kube_config()

api_host = client.CoreV1Api().api_client.configuration.host
bearer_token = client.CoreV1Api().api_client.configuration.api_key['authorization']

group = 'api.ucp.dev'
version = 'v1alpha3'

resource_versions = {
    'System.Resources/resourceGroups': '2022-09-01-privatepreview',
    'Applications.Core/environments': '2022-03-15-privatepreview',
    'Applications.Core/applications': '2022-03-15-privatepreview'
}

@app.route('/', methods=['GET'])
def index():
    return jsonify({'message': 'Welcome to the Radius dashboard server'})

@app.route(f'/api/v1/resource/<path:resource_id>', methods=['GET'])
def get_resource(resource_id, cache=True):
    if cache:
        print(f'Cache hit for {resource_id}')
        return get_resource_from_cache(resource_id)
    else:
        print(f'Cache miss for {resource_id}')
        return get_resource_from_server(resource_id)

@lru_cache(maxsize=100)
def get_resource_from_cache(resource_id):
    return get_resource_from_server(resource_id)

def get_resource_from_server(resource_id):
    response = {}
    resource_path = f"/planes/radius/local/{resource_id}"
    
    # Split the resource_id into the resource group and resource name
    resource_id_parts = resource_id.split('/')

    resource_group = ''
    resource_namespace = ''
    resource_type = ''
    resource_name = ''

    # Get all resource groups
    if len(resource_id_parts) == 1:
        resource_namespace = 'System.Resources'
        resource_type = resource_id_parts[0]
    # Get a specific resource group
    if len(resource_id_parts) == 2:
        resource_namespace = 'System.Resources'
        resource_type = resource_id_parts[0]
        resource_group = resource_id_parts[1]
    # Get all providers
    if len(resource_id_parts) == 3:
        return jsonify({'message': 'Not implemented'})
    # Get all resources of all types in a provider
    if len(resource_id_parts) == 4:
        #return jsonify({'message': 'Not implemented'})
        resource_group = resource_id_parts[1]
        resource_namespace = resource_id_parts[3]
    # Get all resources of a specific type in a provider
    if len(resource_id_parts) == 5:
        resource_group = resource_id_parts[1]
        resource_namespace = resource_id_parts[3]
        resource_type = resource_id_parts[4]
    # Get a specific resource
    if len(resource_id_parts) == 6:
        resource_group = resource_id_parts[1]
        resource_namespace = resource_id_parts[3]
        resource_type = resource_id_parts[4]
        resource_name = resource_id_parts[5]

    try:
        api_version = resource_versions[f'{resource_namespace}/{resource_type}']
    except:
        # Fallback version
        api_version = '2022-03-15-privatepreview'

    url = f"{api_host}/apis/{group}/{version}{resource_path}"
    headers = {'Authorization': f'{bearer_token}'}
    url_params = {'api-version': f'{api_version}'}

    r = requests.get(
        url=url,
        headers=headers,
        params=url_params,
        verify=False,
        allow_redirects=True
    )

    if r.status_code == 200:
        response = r.json()
    else:
        print(f'Error: {r.status_code} - {r.text}')
        return jsonify({'message': 'Error'})

    return jsonify(response)
    
if __name__ == '__main__':
    app.run(debug=True)
    