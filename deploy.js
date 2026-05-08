#!/usr/bin/env node
/**
 * PassiNest — Script de déploiement Vercel
 * Usage: node deploy.js
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const TOKEN   = process.env.VERCEL_TOKEN || ''
const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_BLenLAqdj1aPPzZEibKVNNAF'
const PROJECT  = 'passinest'

if (!TOKEN) {
  console.error('❌  VERCEL_TOKEN manquant. Lance : VERCEL_TOKEN=ton_token node deploy.js')
  process.exit(1)
}

function request(method, path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = data ? (typeof data === 'string' ? Buffer.from(data) : Buffer.from(JSON.stringify(data))) : null
    const options = {
      hostname: 'api.vercel.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': typeof data === 'string' ? 'application/octet-stream' : 'application/json',
        ...(body ? { 'Content-Length': body.length } : {}),
        ...headers
      }
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }) }
        catch { resolve({ status: res.statusCode, body: raw }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function deploy() {
  console.log('\n🏠  PassiNest — Déploiement Vercel\n')

  // 1. Read HTML file
  const htmlPath = path.join(__dirname, 'index.html')
  if (!fs.existsSync(htmlPath)) {
    console.error('❌  index.html introuvable dans ce dossier')
    process.exit(1)
  }
  const content = fs.readFileSync(htmlPath, 'utf8')
  const sha = crypto.createHash('sha1').update(content).digest('hex')
  const size = Buffer.byteLength(content, 'utf8')
  console.log(`📄  index.html lu (${Math.round(size/1024)}KB, sha=${sha.slice(0,8)}…)`)

  // 2. Upload file
  console.log('⬆️   Upload du fichier…')
  const upload = await request('POST', `/v2/files?teamId=${TEAM_ID}`, content, {
    'x-vercel-digest': sha,
    'Content-Type': 'application/octet-stream'
  })
  if (upload.status !== 200 && upload.status !== 201) {
    // File might already exist (200 or 204), that's OK
    if (upload.status !== 204) {
      console.log(`   Upload status: ${upload.status} (peut être déjà en cache)`)
    }
  } else {
    console.log(`   ✓ Fichier uploadé`)
  }

  // 3. Create deployment
  console.log('🚀  Création du déploiement…')
  const deployPayload = {
    name: PROJECT,
    files: [{ file: 'index.html', sha, size }],
    target: 'production',
    projectSettings: {
      framework: null,
      buildCommand: null,
      outputDirectory: null,
      installCommand: null,
      devCommand: null
    }
  }

  const dep = await request('POST', `/v13/deployments?teamId=${TEAM_ID}&forceNew=1`, deployPayload)

  if (dep.status !== 200 && dep.status !== 201) {
    console.error('\n❌  Erreur de déploiement:', dep.status)
    console.error(JSON.stringify(dep.body, null, 2))
    process.exit(1)
  }

  const { id, url, readyState } = dep.body
  console.log(`\n✅  Déploiement créé!`)
  console.log(`   ID    : ${id}`)
  console.log(`   URL   : https://${url}`)
  console.log(`   Status: ${readyState}`)

  // 4. Poll until ready
  if (readyState !== 'READY') {
    console.log('\n⏳  En attente de la mise en ligne…')
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const check = await request('GET', `/v13/deployments/${id}?teamId=${TEAM_ID}`)
      const state = check.body.readyState
      process.stdout.write(`   ${state}…\r`)
      if (state === 'READY') {
        console.log(`\n\n🎉  PassiNest est EN LIGNE!`)
        console.log(`   👉  https://${url}`)
        console.log(`   👉  https://${PROJECT}.vercel.app\n`)
        break
      }
      if (state === 'ERROR') {
        console.error('\n❌  Erreur lors du build')
        break
      }
    }
  } else {
    console.log(`\n🎉  PassiNest est EN LIGNE!`)
    console.log(`   👉  https://${url}`)
    console.log(`   👉  https://${PROJECT}.vercel.app\n`)
  }
}

deploy().catch(err => {
  console.error('❌  Erreur:', err.message)
  process.exit(1)
})
