def GenerateConfig(context):
    """Generate YAML resource configuration."""
    name_prefix = context.env['deployment'] + 'dataproccluster'
    cluster_name = name_prefix

    resources = [
        {
            'name': cluster_name,
            'type': 'dataproc.v1.cluster',
            'properties': {
                'region': context.properties['region'],
                'projectId': context.env['project'],
                'clusterName': cluster_name,
                'config': {
                    'gceClusterConfig': {
                        'zoneUri': ''.join(
                            ['https://www.googleapis.com/compute/v1/projects/', context.env['project'], '/zones/',
                             context.properties['zone']])
                    },
                    'masterConfig': {
                        'numInstances': 1,
                        'machineTypeUri': ''.join(
                            ['https://www.googleapis.com/compute/v1/projects/', context.env['project'], '/zones/',
                             context.properties['zone'], '/machineTypes/n1-standard-2'])
                    },
                    'workerConfig':{
                        'numInstances': 2,
                        'machineTypeUri': ''.join(
                            ['https://www.googleapis.com/compute/v1/projects/', context.env['project'], '/zones/',
                             context.properties['zone'], '/machineTypes/n1-standard-2'])
                    }

                }
            }
        }
    ]
    return {'resources': resources}
