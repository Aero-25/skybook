import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename=fileURLToPath(import.meta.url)
const __dirname=path.dirname(__filename)
const rootDir=path.resolve(__dirname,'..')
const port=Number(process.env.PORT||4173)

const mimeTypes={
  '.css':'text/css; charset=utf-8',
  '.html':'text/html; charset=utf-8',
  '.ico':'image/x-icon',
  '.jpeg':'image/jpeg',
  '.jpg':'image/jpeg',
  '.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.mjs':'application/javascript; charset=utf-8',
  '.png':'image/png',
  '.svg':'image/svg+xml',
  '.txt':'text/plain; charset=utf-8',
  '.webp':'image/webp',
  '.woff2':'font/woff2'
}

const server=http.createServer(async(request,response)=>{
  try{
    const requestUrl=new URL(request.url||'/',`http://${request.headers.host||'127.0.0.1'}`)
    const relativePath=decodeURIComponent(requestUrl.pathname==='/'
      ? '/login.html'
      : requestUrl.pathname)
    const filePath=path.resolve(rootDir,`.${relativePath}`)
    if(!filePath.startsWith(rootDir)){
      response.writeHead(403)
      response.end('Forbidden')
      return
    }
    const contents=await readFile(filePath)
    const ext=path.extname(filePath).toLowerCase()
    response.writeHead(200,{
      'content-type':mimeTypes[ext]||'application/octet-stream',
      'cache-control':'no-store'
    })
    response.end(contents)
  }catch(error){
    response.writeHead(404,{'content-type':'text/plain; charset=utf-8'})
    response.end(`Not found: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
})

server.listen(port,'127.0.0.1',()=>{
  console.log(`SkyBook smoke server running at http://127.0.0.1:${port}`)
})
