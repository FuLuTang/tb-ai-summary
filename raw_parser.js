
// raw_parser.js - Handles raw email content parsing (RFC822)

/**
 * Parses raw email content (RFC822) to extract the most relevant body text.
 * Falls back to this when the standard API fails to return body content.
 */
function parseRawEmailContent(raw) {
    if (!raw) return "";

    // --- Helper Functions ---

    // Decode Quoted-Printable
    function decodeQP(str) {
        return str.replace(/=[\r\n]+/g, "").replace(/=([0-9A-F]{2})/gi, function (match, hex) {
            return String.fromCharCode(parseInt(hex, 16));
        });
    }

    // Decode Base64 (supporting UTF-8)
    function decodeBase64(str) {
        try {
            const clean = str.replace(/\s/g, '');
            const binary = atob(clean);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
            console.warn("Base64 decode failed:", e);
            return "";
        }
    }

    // --- 1. Separate Top-Level Headers and Body Start ---

    // Header block ends at first double newline
    let headerEndIndex = raw.indexOf("\r\n\r\n");
    let headerEndLx = -1;

    // Normalize logic: prefer finding the first double newline
    if (headerEndIndex === -1) {
        headerEndLx = raw.indexOf("\n\n");
        if (headerEndLx !== -1) headerEndIndex = headerEndLx;
    }

    // If we have a header block...
    let topHeaders = "";
    let bodyStartIndex = 0;

    if (headerEndIndex !== -1) {
        topHeaders = raw.substring(0, headerEndIndex);
        // Determine offset based on what we found (\r\n\r\n is 4, \n\n is 2)
        // But simply: if `raw[headerEndIndex]` is \r, it's 4, otherwise 2
        if (raw[headerEndIndex] === '\r') {
            bodyStartIndex = headerEndIndex + 4;
        } else {
            bodyStartIndex = headerEndIndex + 2;
        }
    } else {
        // Fallback: assume all headers if no double newline? Or all body? 
        // Single part mixed? Usually standard email has headers.
        if (raw.includes(": ")) {
            topHeaders = raw;
            bodyStartIndex = raw.length;
        } else {
            topHeaders = "";
            bodyStartIndex = 0; // All body
        }
    }

    // --- 2. Check for Multipart Boundary ---
    const boundaryMatch = topHeaders.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s\r\n]+))/i);
    let boundary = null;
    if (boundaryMatch) {
        boundary = boundaryMatch[1] || boundaryMatch[2];
    }

    let candidateParts = [];

    if (boundary) {
        // MULTIPART CASE
        const bodyRaw = raw.substring(bodyStartIndex);
        candidateParts = bodyRaw.split("--" + boundary);
    } else {
        // SINGLE PART CASE
        // The "part" is the whole message (headers + body)
        // We pass the WHOLE raw string to the loop, which will re-parse headers
        candidateParts = [raw];
    }

    // --- 3. Iterate Candidates ---
    let bestContent = "";
    let bestScore = 0; // 0=None, 1=Plain, 2=HTML

    for (const p of candidateParts) {
        if (!p || p.trim() === "--" || p.trim() === "") continue;

        // Parse headers for this part
        let pHeaderEnd = p.indexOf("\r\n\r\n");
        if (pHeaderEnd === -1) pHeaderEnd = p.indexOf("\n\n");

        let pHeaders = "";
        let pBody = "";

        if (pHeaderEnd !== -1) {
            pHeaders = p.substring(0, pHeaderEnd);
            // offset
            let offset = (p[pHeaderEnd] === '\r') ? 4 : 2;
            pBody = p.substring(pHeaderEnd + offset);
        } else {
            // No headers in this chunk.
            // If it was a single part email (boundary=null), we passed [raw], so it MUST have headers.
            // If this path is reached, it means raw didn't have double newline? 
            // Or we are in a sub-part that has no headers (implied text/plain).
            pHeaders = "";
            pBody = p;
        }

        // Detect Type
        const typeMatch = pHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
        const type = typeMatch ? typeMatch[1].toLowerCase().trim() : "";

        // Detect Encoding
        const encodingMatch = pHeaders.match(/Content-Transfer-Encoding:\s*([^;\r\n]+)/i);
        const encoding = encodingMatch ? encodingMatch[1].toLowerCase().trim() : "7bit";

        let score = 0;
        if (type.includes("text/html")) score = 2;
        else if (type.includes("text/plain")) score = 1;
        // Fallback: if single part and has headers but no specific type, assume plain
        // Also if we are in single part mode (no boundary), and we parsed headers, default to plain if text/* or unspecified
        else if ((!boundary || !type) && pHeaders.length > 0) score = 1;

        if (score > bestScore) {
            // Decode
            let decoded = "";
            if (encoding === "base64") {
                decoded = decodeBase64(pBody);
            } else if (encoding === "quoted-printable") {
                decoded = decodeQP(pBody);
            } else {
                decoded = pBody;
            }

            // Clean
            if (score === 2) {
                decoded = decoded.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<!--[\s\S]*?-->/g, '');
                decoded = decoded.replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/p>/gi, '\n')
                    .replace(/<\/div>/gi, '\n')
                    .replace(/<\/tr>/gi, '\n')
                    .replace(/<\/h[1-6]>/gi, '\n');
                decoded = decoded.replace(/<[^>]*>?/gm, ' ');
                decoded = decoded.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            }

            if (decoded && decoded.trim().length > 0) {
                bestContent = decoded;
                bestScore = score;
            }
        }
    }

    // Debug Log snippet if failed
    if (!bestContent && raw && raw.length > 0) {
        console.error("Raw parser failed. Dumping snippet (first 2k chars):");
        console.log(raw.substring(0, 2000));
        console.log("Boundary detected:", boundary);
    }

    return bestContent;
}
