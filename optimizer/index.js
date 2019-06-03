const {withUiHook, htm} = require('@zeit/integration-utils');

const { parse } = require('url')
const rp = require('request-promise')
// const pixelmatch = require('pixelmatch')
// const sizeOf = require('image-size')
const imagemin = require('imagemin');
const imageminJpegtran = require('imagemin-jpegtran');
const imageminPngquant = require('imagemin-pngquant');

async function optimizeImage(image, baseUrl) {
  let imageUrl = baseUrl + image.name
  const ogImage = await rp(imageUrl, { encoding: null })
  const ogSize = ogImage.byteLength

  const optimizedImage = await imagemin.buffer(ogImage, {use: [imageminJpegtran(), imageminPngquant()]})
  const opSize = optimizedImage.byteLength

  const ogUrl = imageUrl

  const needsOptimized = opSize < ogSize

  const results = {
    opSize, ogSize, ogUrl, needsOptimized
  }

  return results;
}

module.exports = withUiHook(async ({payload, zeitClient}) => {
  let metadata = await zeitClient.getMetadata()
  let images = metadata[payload.deploymentId].images
  const baseUrl = metadata[payload.deploymentId].baseUrl
  const unprocessedImages = images.filter(image => !image.processed);

  totalProcessed = 0

  for (const image of images) {
    if(!image.processed && totalProcessed < 20) {
      let result = await optimizeImage(image, baseUrl)
      image.processed = true
      image.ogSize = result.ogSize
      image.opSize = result.opSize
      image.ogUrl = result.ogUrl
      image.opUrl = `https://image-optimizer.mscoutermarsh.now.sh/downloadOptimized${image.name}?image_url=${result.ogUrl}`
      image.needsOptimized = result.needsOptimized
      totalProcessed = totalProcessed + 1
    }
  }

  await zeitClient.setMetadata(metadata)

  return htm`
    <Page>
      <H1>Dope</H1>
    </Page>
  `
})
