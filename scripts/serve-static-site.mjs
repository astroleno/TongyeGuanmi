import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = fileURLToPath(new URL('../', import.meta.url))
const preferredPort = Number(process.env.PORT || 8080)
const host = process.env.HOST || '127.0.0.1'

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webm', 'video/webm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
])

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    const pathname = decodeURIComponent(url.pathname)
    const { filePath, rootPath } = resolvePath(pathname)

    if (!filePath.startsWith(normalize(rootPath + sep))) {
      sendText(response, 403, 'Forbidden')
      return
    }

    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      sendText(response, 404, 'Not found')
      return
    }

    sendFile(request, response, filePath, fileStat.size)
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      sendText(response, 404, 'Not found')
      return
    }

    console.error(error)
    sendText(response, 500, 'Internal server error')
  }
})

listenOnAvailablePort(preferredPort)

function resolvePath(pathname) {
  return {
    filePath: normalize(join(siteRoot, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''))),
    rootPath: siteRoot
  }
}

function sendFile(request, response, filePath, size) {
  const contentType = mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream'
  const range = request.headers.range
  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': contentType
  }

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` })
      response.end()
      return
    }

    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Number(match[2]) : size - 1

    if (start >= size || end >= size || start > end) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` })
      response.end()
      return
    }

    response.writeHead(206, {
      ...commonHeaders,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`
    })
    createReadStream(filePath, { start, end }).pipe(response)
    return
  }

  response.writeHead(200, {
    ...commonHeaders,
    'Content-Length': size
  })
  createReadStream(filePath).pipe(response)
}

function sendText(response, status, body) {
  response.writeHead(status, {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'text/plain; charset=utf-8'
  })
  response.end(body)
}

function listenOnAvailablePort(port) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < preferredPort + 20) {
      listenOnAvailablePort(port + 1)
      return
    }

    console.error(error)
    process.exitCode = 1
  })

  server.listen(port, host, () => {
    console.log(`Serving ${siteRoot}`)
    console.log(`Local: http://localhost:${port}`)
  })
}
