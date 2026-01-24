import fs from 'fs/promises'
import { createReadStream } from 'node:fs'
import path from 'path'
import sharp from 'sharp'
import express from 'express'
import basicAuth from 'express-basic-auth'
import { constants } from 'buffer'
import favicon from 'serve-favicon'

const PORT_NUMBER = process.env.PORT_NUMBER || 80
const PHOTOS_ROOT_PATH = process.env.PHOTOS_ROOT_PATH || '/photos'
const SAVE_PREVIEWS = process.env.SAVE_PREVIEWS === 'true' || false
const PREVIEWS_ROOT_PATH = process.env.PREVIEWS_ROOT_PATH || '/previews'
const PREVIEW_SIZE = process.env.PREVIEW_SIZE || 150
const HTML_URL_BASE = process.env.HTML_URL_BASE || '/gallery/'
const FILES_URL_BASE = process.env.FILES_URL_BASE || '/galleryfiles/'
const PREVIEWS_URL_BASE = process.env.PREVIEWS_URL_BASE || '/gallerypreviews/'
const BASIC_AUTH_USERS_FILE = process.env.BASIC_AUTH_USERS_FILE || null
const BASIC_AUTH_REALM = process.env.BASIC_AUTH_REALM || 'simple-gallery'
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug' // 'error', 'info' or 'debug'

const log = (level, message) => {
  const levels = { error: 0, info: 1, debug: 2 }
  if (levels[level] <= levels[LOG_LEVEL]) {
    console.log(`[${level.toUpperCase()}] - ${new Date().toISOString()} - ${message}`)
  }
}

const logError = (message) => log('error', message)
const logInfo = (message) => log('info', message)
const logDebug = (message) => log('debug', message)

const HTML_PAGE_START = `
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <link rel="icon" href="/favicon.ico" type="image/x-icon" />
    <link rel="license" href="https://www.gnu.org/licenses/agpl-3.0.txt" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.fluid.classless.lime.min.css">
    <title>Simple Gallery</title>
    </head>
    <body>
    <main>
    `
const HTML_PAGE_END = `</main></body></html>`

const server = express()

server.use(favicon('favicon.ico'))

let users = {}

if (BASIC_AUTH_USERS_FILE) {
  // load users from file
  try {
    let usersFileContent = await fs.readFile(BASIC_AUTH_USERS_FILE, 'utf-8')
    users = JSON.parse(usersFileContent)
  } catch (err) {
    logError('Error loading BASIC_AUTH_USERS_FILE: ' + err)
  }

  let users4BasicAuth = users
    .map((u) => [u.userName, u.password])
    .reduce((obj, [key, value]) => {
      obj[key] = value
      return obj
    }, {})

  logInfo('Loaded users for basic auth')

  const ensureAuth = basicAuth({
    users: users4BasicAuth,
    challenge: true,
    realm: BASIC_AUTH_REALM,
    unauthorizedResponse: (req) => {
      return (
        HTML_PAGE_START +
        '<h1>' +
        (req.auth ? 'Credentials rejected' : 'No credentials provided') +
        '</h1>' +
        HTML_PAGE_END
      )
    },
  })

  server.use(ensureAuth)
}

/**
 * Check if the given routePath is allowed for the given accessLevel
 * @param {string | object} accessLevel
 * @param {string} routePath
 * @returns {boolean} true if allowed, false otherwise
 */
const isPathAllowed = (accessLevel, routePath) => {
  // comparison is done on encoded paths without slashes
  routePath = encodeURIComponent(routePath.replace(/\//g, ''))
  if (accessLevel !== 'all') {
    if (typeof accessLevel === 'object') {
      // check deny list first
      if (accessLevel.deny) {
        for (const deniedEntry of accessLevel.deny) {
          const deniedPath = encodeURIComponent((HTML_URL_BASE + deniedEntry).replace(/\//g, ''))
          logDebug(`Checking denied entry ${deniedPath} for path ${routePath}`)

          if (routePath.includes(deniedPath)) {
            logDebug(`Path ${routePath} is denied due to denied entry ${deniedPath}`)
            return false
          }
        }
      }
      // check allow list
      if (accessLevel.allow) {
        let allowed = false
        for (const allowedEntry of accessLevel.allow) {
          const allowedPath = encodeURIComponent((HTML_URL_BASE + allowedEntry).replace(/\//g, ''))
          logDebug(`Checking allowed entry ${allowedPath} for path ${routePath}`)
          if (routePath.includes(allowedPath)) {
            allowed = true
            break
          }
        }
        if (!allowed) {
          logDebug(`Path ${routePath} is denied for lack of allowed entry`)

          return false
        }
      }
    } else {
      return false
    }
  }
  return true
}

// serve original files
server.use(FILES_URL_BASE, express.static(PHOTOS_ROOT_PATH))

// serve html gallery
server.get(new RegExp('^' + HTML_URL_BASE + '.*'), async (req, resp) => {
  logDebug('Requested route: ' + req.path)

  let accessLevel
  if (BASIC_AUTH_USERS_FILE) {
    // get access level
    accessLevel = users.find((u) => u.userName === req.auth.user)?.accessLevel || 'none'
    logDebug('Authenticated user: ' + req.auth.user)
    logDebug('Access level: ' + JSON.stringify(accessLevel))
    const isAllowed = isPathAllowed(accessLevel, req.path)
    if (!isAllowed) {
      logInfo(`Access denied to user ${req.auth.user} for path ${req.path}`)
      resp.statusCode = 403
      resp.end('Access denied')
      return
    }
  }

  let routePath = decodeURIComponent(req.path).substring(HTML_URL_BASE.length)
  let routeFullPath = path.join(PHOTOS_ROOT_PATH, routePath)

  try {
    await fs.access(routeFullPath, constants.R_OK)
  } catch {
    logError('Path requested but not found on disk: ' + routeFullPath)
    resp.statusCode = 404
    resp.end('Route not found')
    return
  }

  let filestat = await fs.lstat(routeFullPath)
  if (filestat.isDirectory()) {
    // list all files and subdirectories
    let dirContent = await fs.readdir(routeFullPath, { withFileTypes: true })
    // sort directories first, then files, both alphabetically
    dirContent = dirContent.sort((a, b) => b.isDirectory() - a.isDirectory() || a.name > b.name)

    let respHtml = HTML_PAGE_START
    respHtml += `
    <header>
    <h1>${routePath.length > 0 ? routePath : 'Home'}</h1>
    </header>
    `

    if (routePath.length > 0) {
      // there is a parent directory
      let iSlash = routePath.lastIndexOf('/')
      if (iSlash === -1) {
        // no smlash found, remove the whole string
        iSlash = 0
      }
      respHtml += `<a href="${HTML_URL_BASE + routePath.substring(0, iSlash)}"><h4>⬆️ Up</h4></a><br><br>`
    }

    for (const dirEntry of dirContent) {
      const fileName = dirEntry.name
      const filePath = path.join(routePath, fileName)

      if (fileName.startsWith('.')) {
        // skip hidden files and directories
        continue
      }
      if (dirEntry.isDirectory()) {
        // it's a directory
        let isAllowed = true
        if (BASIC_AUTH_USERS_FILE) {
          isAllowed = isPathAllowed(accessLevel, HTML_URL_BASE + filePath + '/')
        }
        if (isAllowed)
          respHtml += '<h4><a href="' + HTML_URL_BASE + filePath + '">📁 ' + fileName + '</a></h4>'
      } else if (
        ['.mov', '.avi', '.mpg', '.mpeg', '.mp4', '.wmv'].includes(
          path.extname(fileName).toLowerCase()
        )
      ) {
        // it's a video file
        respHtml += `<a href="${FILES_URL_BASE + filePath}">`
        respHtml += `<figure style="display:inline-block; margin:10px; text-align:center;">`
        respHtml += `<span style="font-size:60px;">🎞️</span>`
        respHtml += `<figcaption style="font-size:x-small">${fileName}</figcaption>`
        respHtml += `</figure></a>`
      } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(fileName).toLowerCase())) {
        // it's a file
        // only keep image files

        let imgPreviewPath = PREVIEWS_URL_BASE + filePath + '@' + PREVIEW_SIZE
        respHtml += `<a href="${FILES_URL_BASE + filePath}">`
        respHtml += `<figure style="display:inline-block; margin:10px; text-align:center;">`
        respHtml += `<img src="${imgPreviewPath}">`
        respHtml += `<figcaption style="font-size:x-small">${fileName}</figcaption>`
        respHtml += `</figure></a>`
      }
    }

    respHtml += HTML_PAGE_END

    resp.send(respHtml)
    return
  } else {
    resp.sendStatus(404)
  }
})

if (SAVE_PREVIEWS == 'true' || SAVE_PREVIEWS === true) {
  // setup static serving of previews folder
  server.use(PREVIEWS_URL_BASE, express.static(PREVIEWS_ROOT_PATH))
}

// create and serve preview picture
server.get(new RegExp('^' + PREVIEWS_URL_BASE + '.*'), async (req, resp) => {
  logDebug('Requested preview photo: ' + req.path)

  let routePath = decodeURIComponent(req.path).substring(PREVIEWS_URL_BASE.length)
  let previewsRouteFullPath = path.join(PREVIEWS_ROOT_PATH, routePath)

  if (SAVE_PREVIEWS == 'true' || SAVE_PREVIEWS === true) {
    // extract folder name
    let pp = previewsRouteFullPath.split('/')
    let filename = pp[pp.length - 1]
    let folderName = previewsRouteFullPath.substring(
      0,
      previewsRouteFullPath.length - filename.length
    )
    // check if folder exists, otherwise create it
    try {
      await fs.access(folderName, fs.constants.R_OK)
    } catch {
      logInfo('Preview folder does not exist, creating it ' + folderName)
      await fs.mkdir(folderName, { recursive: true })
    }
    // check if file exists, otherwise create it
    try {
      await fs.access(previewsRouteFullPath, fs.constants.R_OK)
      // this should never happen due to express static serving the previews folder
      createReadStream(previewsRouteFullPath).pipe(resp)
    } catch {
      logInfo('Preview file does not exist, creating it ' + previewsRouteFullPath)

      // create the the previewfile
      let originalFileFullPath = path.join(PHOTOS_ROOT_PATH, routePath)
      // remove the @
      let size = parseInt(originalFileFullPath.substring(originalFileFullPath.indexOf('@') + 1))
      originalFileFullPath = originalFileFullPath.substring(0, originalFileFullPath.indexOf('@'))
      let filebuffer = await fs.readFile(originalFileFullPath)
      await sharp(filebuffer).resize(size, size, { fit: 'inside' }).toFile(previewsRouteFullPath)

      // now open the preview file and serve it
      createReadStream(previewsRouteFullPath).pipe(resp)
    }
  } else {
    // create the the previewfile
    let originalFileFullPath = path.join(PHOTOS_ROOT_PATH, routePath)
    // remove the @
    let size = parseInt(originalFileFullPath.substring(originalFileFullPath.indexOf('@') + 1))
    originalFileFullPath = originalFileFullPath.substring(0, originalFileFullPath.indexOf('@'))
    let filebuffer = await fs.readFile(originalFileFullPath)
    let outputBuffer = await sharp(filebuffer).resize(size, size, { fit: 'inside' }).toBuffer()

    let extension = path.extname(originalFileFullPath).toLowerCase()
    if (extension === '.jpg' || extension === '.jpeg') {
      resp.set('Content-Type', 'image/jpeg')
    } else if (extension === '.png') {
      resp.set('Content-Type', 'image/png')
    } else if (extension === '.gif') {
      resp.set('Content-Type', 'image/gif')
    }
    resp.send(outputBuffer)
  }
})

server.listen(PORT_NUMBER, () => {
  const threads = sharp.concurrency()
  logInfo(`Server listening on ${PORT_NUMBER} with ${threads} sharp threads`)
})
