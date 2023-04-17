from flask import Flask, request, jsonify
from kubernetes import client, config
import os
import requests
from functools import lru_cache
import json

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
    'Applications.Core/applications': '2022-03-15-privatepreview',
    'Applications.Core/containers': '2022-03-15-privatepreview',
    'Applications.Core/httpRoutes': '2022-03-15-privatepreview',
    'Applications.Core/gateways': '2022-03-15-privatepreview',
    'Applications.Link/mongoDatabases': '2022-03-15-privatepreview',
    'Applications.Link/sqlDatabases': '2022-03-15-privatepreview',
    'Applications.Link/redisCaches': '2022-03-15-privatepreview',
    'Applications.Link/rabbitMQMessageQueues': '2022-03-15-privatepreview',
    'Applications.Link/daprStateStores': '2022-03-15-privatepreview',
    'Applications.Link/daprPubSubBrokers': '2022-03-15-privatepreview',
    'Applications.Link/daprSecretStores': '2022-03-15-privatepreview',
    'Applications.Link/daprInvokeHttpRoutes': '2022-03-15-privatepreview',
}

@app.route('/', methods=['GET'])
def index():
    return jsonify({'message': 'Welcome to the Radius dashboard server'})

@app.route(f'/api/v1/resource/<path:resource_id>', methods=['GET'])
def resource_route(resource_id):
    resource = get_resource(resource_id)
    return jsonify(resource)

#@lru_cache(maxsize=100)
def get_resource(resource_id) -> dict:
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
        return {'message': 'Not implemented'}
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

        resources = list()
        if resource_type == 'applications' and resource_name != '':
            print('Getting resources for application: ' + resource_path)
            # For this call let's assume all application resources will be in the same resource group, which is not always true for advanced applications
            resources = get_app_resources(resource_path, resource_group)

        response.update({'resources': resources})
        
    else:
        print(f'Error: {r.status_code} - {r.text}')
        response = {'message': 'Error'}

    return response
    
def get_app_resources(application_id, resource_group_name) -> list:

    resources = list()

    for type, version in resource_versions.items():
        data = dict()
        if type == 'Applications.Core/applications' or type == 'Applications.Core/environments' or type.startswith('System'):
            continue
        print(f'Checking for all resources of type {type}')
        data = get_resource(f'resourceGroups/{resource_group_name}/providers/{type}')
        values = data['value']
        for value in values:
            if value['properties']['application'].lower() == application_id.lower():
                resources.append(value)
            
    return resources

if __name__ == '__main__':
    app.run(debug=True)
    