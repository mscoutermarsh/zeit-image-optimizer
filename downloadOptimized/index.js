const { parse } = require('url')
const rp = require('request-promise')
const imagemin = require('imagemin');
const imageminJpegtran = require('imagemin-jpegtran');
const imageminPngquant = require('imagemin-pngquant');

module.exports = async function (req, res) {
  const { query } = parse(req.url, true)
  const { image_url } = query

  if (
    typeof query == 'undefined' ||
    typeof image_url == 'undefined'
  ) {
    res.end('USAGE: set image_url')
  } else {
    const image = await rp(image_url, { encoding: null })
    const optimizedImage = await imagemin.buffer(image, {use: [imageminJpegtran(), imageminPngquant()]})

    let filetype = image_url.split(".")
    filetype = filetype[filetype.length-1]

    let filename = image_url.split("/")
    filename = filename[filename.length-1]

    res.setHeader('Content-Type', `image/${filetype}`);
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Cache-Control', `public, immutable, no-transform, s-maxage=31536000, max-age=31536000`);
    res.end(optimizedImage);
  }
}
