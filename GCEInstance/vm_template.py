# Copyright 2016 Google Inc. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Creates a VM with user specified disks attached to it."""

COMPUTE_URL_BASE = 'https://www.googleapis.com/compute/v1/'


def GlobalComputeUrl(project, collection, name):
    return ''.join([COMPUTE_URL_BASE, 'projects/', project,
                    '/global/', collection, '/', name])


def DiskName(context, diskobj):
    return context.env['deployment'] + '-disk-' + diskobj


def DiskType(context, project, disk_obj):
    return ''.join([COMPUTE_URL_BASE, 'projects/', project, '/zones/', context.properties['zone'], '/diskTypes/',
                    disk_obj['diskType']])


def MachineType(project, zone, machine_type):
    return ''.join([COMPUTE_URL_BASE, 'projects/', project, '/zones/', zone, '/machineTypes/', machine_type])


def GenerateConfig(context):
    """Creates configuration."""
    print(context)

    resources = []
    project = context.env['project']

    # Add tags to VM
    tags = []
    for value in context.properties['tags']:
        tags.append(value)

    tags = {'items': tags}

    # Create Metadata Items
    items = []
    for key, value in context.properties['metadata-from-file'].iteritems():
        items.append({
            'key': key,
            'value': context.imports[value]
        })
    metadata = {'items': items}

    # Create disks resources
    # boot_disk = filter(lambda disk_obj: disk_obj['name'] == 'boot', context.properties['disks'])
    # aditional_disks = filter(lambda disk_obj: disk_obj['name'] != 'boot', context.properties['disks'])
    for disk_obj in context.properties['disks']:
        if disk_obj['name'] == 'boot':
            boot_disk = disk_obj

    disks = [{'deviceName': DiskName(context, boot_disk['name']),
              'type': 'PERSISTENT',
              'boot': True,
              'autoDelete': True,
              'initializeParams': {
                  'diskName': DiskName(context, boot_disk['name']),
                  'sourceImage': GlobalComputeUrl(
                      boot_disk['imageProject'], 'images', ''.join(['family/', boot_disk['imageFamily']])),
                  'diskType': DiskType(context, project, boot_disk),
                  'diskSizeGb': str(boot_disk['sizeGb'])
              }
              }]
    for disk_obj in context.properties['disks']:
        if disk_obj['name'] != 'boot':
            resources.append({'name': DiskName(context, disk_obj['name']),
                              'type': 'compute.v1.disk',
                              'properties': {
                                  'zone': context.properties['zone'],
                                  'sizeGb': str(disk_obj['sizeGb']),
                                  'type': DiskType(context, project, disk_obj)
                              }
                              })

            disks.append({'deviceName': DiskName(context, disk_obj['name']),
                          'type': 'PERSISTENT',
                          'source': ''.join(['$(ref.', DiskName(context, disk_obj['name']),
                                             '.selfLink)']),
                          'autoDelete': True})

    # create Instance with Metadata and Disks
    instance = {
        'zone': context.properties['zone'],
        'machineType': MachineType(project, context.properties['zone'], context.properties['vm-type']),

        'networkInterfaces': [{
            'network': GlobalComputeUrl(
                context.env['project'], 'networks', 'default'),
            'accessConfigs': [{
                'name': 'External NAT',
                'type': 'ONE_TO_ONE_NAT'}],
        }],
        'disks': disks,
        'metadata': metadata,
        'tags': tags
    }

    resources.append({'name': context.env['deployment'] + '-vm',
                      'type': 'compute.v1.instance',
                      'properties': instance
                      })

    return {'resources': resources}
