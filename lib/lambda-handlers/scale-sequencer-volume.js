const AWS = require('aws-sdk')
const ec2 = new AWS.EC2()

exports.handler = async (event) => {
  const volumeId = event.detail.requestParameters.volumeId

  // Retrieve the current size of the volume
  const describeParams = {
    VolumeIds: [volumeId]
  }
  const describeResponse = await ec2.describeVolumes(describeParams).promise()
  const currentSize = describeResponse.Volumes[0].Size

  // Add 20GB to the current size
  const newSize = currentSize + 20

  // Modify the volume size
  const modifyParams = {
    VolumeId: volumeId,
    Size: newSize
  }
  await ec2.modifyVolume(modifyParams).promise()
}
