export default {
	async fetch(request, env) {
		let headers = new Headers()
		headers.set('Access-Control-Allow-Origin', '*')
		headers.set('Access-Control-Allow-Methods', '*')
		headers.set('Access-Control-Allow-Headers', '*')

		let url = new URL(request.url)
		let objectName = url.pathname.slice(1)

		console.log(`${request.method} object ${objectName}: ${request.url}`)

		if (!objectName) {
			let prefix = url.searchParams.get('prefix')

			if (!prefix) {
				return new Response(`
					<div style="text-align:center; margin-top: 100px;">
						<p>Welcome to ConchBrain OSS</p>
						<p>Please visit <a href="https://www.conchbrain.club/" target="_blank">here</a> to use</p>
					</div>
				`, {
					status: 200,
					headers: { 'Content-Type': 'text/html charset=utf-8' }
				})
			}

			let options = {
				prefix,
				delimiter: url.searchParams.get('delimiter') ?? undefined,
				cursor: url.searchParams.get('cursor') ?? undefined,
				include: ['customMetadata', 'httpMetadata'],
			}

			console.log(JSON.stringify(options))

			let listing = await env.BUCKET.list(options)
			headers.set('content-type', 'application/json; charset=UTF-8')
			return new Response(JSON.stringify(listing), { headers })
		}

		if (request.method == 'OPTIONS') {
			return new Response('ok', { headers })
		}

		if (request.method == 'HEAD') {
			let object = await env.BUCKET.head(objectName)
			if (!object) return new Response(`object ${objectName} is not found`, { status: 404 })

			object.writeHttpMetadata(headers)
			headers.set('Etag', object.httpEtag)
			return new Response(objectName, { headers })
		}

		if (request.method == 'GET') {
			let object = await env.BUCKET.get(objectName, {
				range: request.headers,
				onlyIf: request.headers,
			})
			if (!object) return new Response(`object ${objectName} is not found`, { status: 404 })

			object.writeHttpMetadata(headers)
			headers.set('Content-Type', 'application/octet-stream')
			headers.set('Content-Disposition', `attachment; filename=${object.key.split('/').at(-1)}`)
			headers.set('Content-Length', object.size)
			headers.set('Etag', object.httpEtag)
			if (object.range) {
				headers.set("Content-Range", `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`)
			}

			let status = object.body ? (request.headers.get("range") ? 206 : 200) : 304
			return new Response(object.body, { headers, status })
		}

		if (request.method == 'PUT' || request.method == 'POST') {
			let object = await env.BUCKET.put(objectName, request.body, {
				httpMetadata: request.headers,
			})

			headers.set('Etag', object.httpEtag)
			return new Response(objectName, { headers })
		}

		if (request.method == 'DELETE') {
			await env.BUCKET.delete(objectName)
			return new Response('deleted', { headers })
		}

		return new Response(`Unsupported method`, { status: 400 })
	},

	async scheduled(event, env, ctx) {
		let now = new Date()

		let listing = await env.BUCKET.list({
			include: ['customMetadata', 'httpMetadata']
		})

		for (let object of listing.objects) {	
			let uploaded = new Date(object.uploaded)
			let expires = new Date(uploaded.getTime() + 24 * 60 * 60 * 1000)

			if (now < expires) return
			await env.BUCKET.delete(object.key)
		}
	}
}