export default {
	async fetch(request, env) {
		let url = new URL(request.url)
		let objectName = url.pathname.slice(1)

		console.log(`${request.method} object ${objectName}: ${request.url}`)

		if (!objectName) {
			let options = {
				prefix: url.searchParams.get('prefix') ?? undefined,
				delimiter: url.searchParams.get('delimiter') ?? undefined,
				cursor: url.searchParams.get('cursor') ?? undefined,
				include: ['customMetadata', 'httpMetadata'],
			}

			console.log(JSON.stringify(options))

			let listing = await env.BUCKET.list(options)
			return new Response(JSON.stringify(listing), {
				headers: {
					'content-type': 'application/json; charset=UTF-8',
				}
			})
		}

		if (request.method == 'HEAD') {
			let object = await env.BUCKET.head(objectName)
			if (!object) return new Response(`object ${objectName} is not found`, { status: 404 })

			let headers = new Headers()
			object.writeHttpMetadata(headers)
			headers.set('etag', object.httpEtag)
			return new Response(null, { headers })
		}

		if (request.method == 'GET') {
			let object = await env.BUCKET.get(objectName, {
				range: request.headers,
				onlyIf: request.headers,
			})
			if (!object) return new Response(`object ${objectName} is not found`, { status: 404 })

			let headers = new Headers()
			object.writeHttpMetadata(headers)
			headers.set('etag', object.httpEtag)
			if (object.range) {
				headers.set("content-range", `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`)
			}

			let status = object.body ? (request.headers.get("range") !== null ? 206 : 200) : 304
			return new Response(object.body, { headers, status })
		}

		if (request.method == 'PUT' || request.method == 'POST') {
			let object = await env.BUCKET.put(objectName, request.body, {
				httpMetadata: request.headers,
			})

			return new Response(null, { headers: { 'etag': object.httpEtag } })
		}

		if (request.method == 'DELETE') {
			await env.BUCKET.delete(objectName)
			return new Response()
		}

		return new Response(`Unsupported method`, { status: 400 })
	}
}