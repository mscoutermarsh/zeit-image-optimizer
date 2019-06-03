const {withUiHook, htm} = require('@zeit/integration-utils');
const rp = require('request-promise')

function prettyName(fileName) {
  const parts = fileName.split("/")
  return parts[parts.length - 1]
}

const ImageItem = (image) => {
  if (image.processed && image.needsOptimized) {
    return htm`
              <Box display="table-row">
                <Box display="table-cell" padding="10px">${prettyName(image.name)}</Box>
                <Box display="table-cell" padding="10px"><Link href=${image.ogUrl} target="_blank">${formatBytes(image.ogSize)}</Link></Box>
                <Box display="table-cell" padding="10px"><Link download="mike.jpg" href=${image.opUrl} target="_blank">${formatBytes(image.opSize)}</Link></Box>
                <Box display="table-cell" padding="10px">${(100 - (100*(image.opSize / image.ogSize))).toFixed(2) + '%'}</Box>
              </Box>`
  } else if (image.processed) {
    return htm`
              <Box display="table-row">
                <Box display="table-cell" padding="10px">${prettyName(image.name)}</Box>
                <Box display="table-cell" padding="10px"><Link href=${image.ogUrl} target="_blank">${formatBytes(image.ogSize)}</Link></Box>
                <Box display="table-cell" padding="10px"><Link href=${image.opUrl} target="_blank">${formatBytes(image.opSize)}</Link></Box>
                <Box display="table-cell" padding="10px">N/A</Box>
              </Box>`
  } else {
    return htm`
              <Box display="table-row">
                <Box display="table-cell" padding="10px">${prettyName(image.name)}</Box>
              </Box>`
  }
}

const ImagesList = ({images}) => htm`
        ${images.map((image, index) => { return ImageItem(image) })}
`

async function getFiles(id, zeitClient) {
  let apiUrl = `/v5/now/deployments/${id}/files`
	const files = await zeitClient.fetchAndThrow(apiUrl, {method: 'GET'});
  return files
}

function triggerOptimizer(payload, deploymentId) {
  payload.deploymentId = deploymentId

  var options = {
    method: 'POST',
    uri: 'https://image-optimizer.mscoutermarsh.now.sh/optimizer',
    body: payload,
    json: true
  };

  rp(options)
}

const imageRegex = /\.(png|jpg|jpeg)$/;

function getImages(files, path) {

  let imageFiles = []

  files.forEach(function (file, index) {
    if (file.type == "file" && imageRegex.exec(file.name)) {
      console.log(file)
      imageFiles.push({name: path + file.name, uid: file.uid, processed: false, ogSize: null, opSize: null})
    }
    if (file.children) {
      const childFiles = getImages(file.children, `${path}${file.name}/`);
      if (childFiles.length > 0) {
        imageFiles = imageFiles.concat(childFiles)
      }
    }
  })
  return imageFiles
}

module.exports = withUiHook(async ({payload, zeitClient}) => {
	const {projectId} = payload;

	if (!projectId) {
    return htm`
    <Page>
      <H1>Select a project to begin</H1>
      <ProjectSwitcher />
    </Page>
  `
	} else {
    let apiUrl = `/v4/now/deployments?limit=10`;
		apiUrl += `&projectId=${projectId}`

    const {deployments} = await zeitClient.fetchAndThrow(apiUrl, {method: 'GET'});
    const deployment = deployments.find(function(d) {
      return d.state == "READY"
    });

    let deploymentId = projectId

    if (deployment) {
      deploymentId = deployment.uid
    }

    const metadata = await zeitClient.getMetadata()

    if(!metadata[deploymentId]) {
      const files = await getFiles(deploymentId, zeitClient)
      let images = []
      if (files && files[1]) {
        images = getImages(files[1].children, "/")
      }

      metadata[deploymentId] = { baseUrl: `https://${deployment.url}`, images: images }

      await zeitClient.setMetadata(metadata)
    }

    console.log(metadata[deploymentId].images)

    const processedImages = metadata[deploymentId].images.filter(image => image.processed)
    const unprocessedImages = metadata[deploymentId].images.filter(image => !image.processed)
    const goodImages = processedImages.filter(image => !image.needsOptimized)
    const badImages = processedImages.filter(image => image.needsOptimized)

    if (unprocessedImages.length > 0) {
      triggerOptimizer(payload, deploymentId)
    }

    return htm`
    <Page>
      <Box width="100%">
        ${optimzationScore(badImages, goodImages, unprocessedImages, processedImages)}

        <BR/>

        ${refresh(unprocessedImages)}
        ${renderBadImages(badImages)}
        ${renderGoodImages(goodImages)}
        ${renderUnprocessedImages(unprocessedImages)}

        <BR/>
        <BR/>
        <BR/>
        <H2>Try it with another project</H2>
        <ProjectSwitcher />
      </Box>
    </Page>`
  }
});

function optimzationScore(badImages, goodImages, unprocessedImages, processedImages) {
  if (processedImages.length + unprocessedImages.length === 0) {
      return htm`
      <H1>
      <Box fontSize="32px">
    No images found
    </Box>
    </H1>
    <BR/>
    <Box padding="10px" width="100%" backgroundColor="white" color="black" borderColor="#eaeaea" borderStyle="solid" width="100%" borderWidth="1px">
      <P>We were unable to find any images (png or jpg) in this project.</P>
      <P>Give it a try with another project by changing the selector below.</P>
    </Box>
    `
} else if (unprocessedImages.length > 0) {
    return(htm`
    <H1>Crunching ${unprocessedImages.length} images...</H1>`)
  } else {
    if (goodImages.length === processedImages.length) {
      return htm`
      <H1>
      <Box fontSize="32px">
    <Img height="22px" src="https://image-optimizer.mscoutermarsh.now.sh/static/good.svg" />
Image Score: <Box display="inline" color="green"><B>100</B></Box></Box>
    </H1>
    <P>All of your images are already optimized. Nice work!</P>
    `
    } else {
      return htm`
      <H1>
      <Box fontSize="32px">
    <Img height="22px" src="https://image-optimizer.mscoutermarsh.now.sh/static/alert.svg" />
    Image Score: <Box display="inline" color="gray"><B>${parseInt(100 * ((processedImages.length - badImages.length) / processedImages.length)) + "%"}</B></Box></Box>
    </H1>
    <P>Optimize all your images to improve your page download speeds.</P>
    <Box padding="10px" width="100%" backgroundColor="white" color="black" borderColor="#eaeaea" borderStyle="solid" width="100%" borderWidth="1px">
      <P><B>How do I optimize my images?</B></P>
      <P>Download the already optimized images below. Or we recommend using <Link href="https://github.com/marketplace/imgbot">ImgBot</Link> (automatic via GitHub), <Link href="https://imageoptim.com/mac">ImageOptim</Link> (Mac), <Link href="https://sourceforge.net/projects/nikkhokkho/">FileOptimizer</Link> (Windows).</P>
      <P><B>What does lossless mean?</B></P>
      <P>No change in image quality. Your images will look just as good, without taking up as much space.</P>
      <P><B>Can Now do it for me?</B></P>
      <P>For PNG's take a look at the <Link href="https://zeit.co/docs/v2/deployments/official-builders/optipng-now-optipng">@now/optipng</Link> builder to automate this.</P>
    </Box>
    `
    }
  }
}

function refresh(unprocessedImages) {
  if (unprocessedImages.length === 0) return "";

  return htm`<AutoRefresh timeout="3000" />`
}

function renderBadImages(badImages) {
  if (badImages.length === 0) return "";

  return htm`<Box padding="10px" width="100%" backgroundColor="white" color="gray"  borderColor="#eaeaea" borderStyle="solid" width="100%" borderWidth="1px"><B>
        Needs optimization</B>(${badImages.length})</Box>
        <Box width="100%" display="table">
          <Box display="table-row" color="#a7a7a7" borderColor="#a7a7a7" borderStyle="solid" width="100%" borderBottomWidth="1px">
            <Box display="table-cell" padding="10px">IMAGE</Box>
            <Box display="table-cell" padding="10px">ORIGINAL</Box>
            <Box display="table-cell" padding="10px">OPTIMIZED</Box>
            <Box display="table-cell" padding="10px">SAVINGS</Box>
          </Box>
          <${ImagesList} images=${badImages} //>
        </Box>

        <BR/>`
}

function renderGoodImages(goodImages) {
  if (goodImages.length === 0) return "";

  return htm`<Box padding="10px" width="100%" backgroundColor="white" color="green"  borderColor="#eaeaea" borderStyle="solid" width="100%" borderWidth="1px">
  <B>Already optimized</B>(${goodImages.length})</Box>
        <Box width="100%" display="table">
          <Box display="table-row" color="#a7a7a7" borderColor="#a7a7a7" borderStyle="solid" width="100%" borderBottomWidth="1px">
            <Box display="table-cell" padding="10px">IMAGE</Box>
            <Box display="table-cell" padding="10px">ORIGINAL</Box>
            <Box display="table-cell" padding="10px">OPTIMIZED</Box>
            <Box display="table-cell" padding="10px">SAVINGS</Box>
          </Box>
          <${ImagesList} images=${goodImages} //>
        </Box>`
}

function renderUnprocessedImages(unprocessedImages) {
  if (unprocessedImages.length === 0) return "";

  return htm`
<Box padding="10px" width="100%" backgroundColor="white" color="black"  borderColor="#eaeaea" borderStyle="solid" width="100%" borderWidth="1px"><B>Still processing</B></Box>
    <Box width="100%" display="table">
      <Box display="table-row" color="#a7a7a7" borderColor="#a7a7a7" borderStyle="solid" width="100%" borderBottomWidth="1px">
        <Box display="table-cell" padding="10px">IMAGE</Box>
      </Box>
      <${ImagesList} images=${unprocessedImages} //>
    </Box>

    <BR />
  `
}

function formatBytes(bytes, decimals = 2) {
    if (bytes < 0) return '0 Bytes';
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
