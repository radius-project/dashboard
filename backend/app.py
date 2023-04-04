from flask import Flask, request, jsonify
from kubernetes import client, config
import os
import requests
from functools import lru_cache

app = Flask(__name__)

api_host = ''
bearer_token = ''

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

@app.route(f'/api/{version}/<path:resource_id>', methods=['GET'])
def get_resource(resource_id):
    return show_resource(resource_id)

@lru_cache(maxsize=100) # Cache up to 100 items
def show_resource(resource_id):
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
        return jsonify({'message': 'Not implemented'})
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

    headers = {'Authorization': f'{bearer_token}'}
    url_params = {'api-version': f'{api_version}'}
    try:
        r = requests.get(
            f"{api_host}/apis/{group}/{version}{resource_path}",
            headers=headers,
            params=url_params,
            verify=False,
            allow_redirects=True
        )
        print(r.url)
        response = r.json()
    except Exception as e:
        print(e)
    
    return response
    
if __name__ == '__main__':
    mode = 'in-cluster' if 'KUBERNETES_SERVICE_HOST' in os.environ else 'kube-config'

    if mode == 'kube-config':
        print('Using kube-config locally')
        config.load_kube_config()
    else:
        print('Using in-cluster config')
        config.load_incluster_config()

    api_host = client.CoreV1Api().api_client.configuration.host
    bearer_token = client.CoreV1Api().api_client.configuration.api_key['authorization']

    app.run(debug=True)
    