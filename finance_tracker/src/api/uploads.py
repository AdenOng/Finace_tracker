"""Shared limits for legacy document uploads."""

from typing import BinaryIO

from fastapi import HTTPException
from starlette.datastructures import Headers
from starlette.formparsers import MultiPartException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 64 * 1024
# Allow multipart boundaries and broker fields in addition to the file itself.
MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 64 * 1024
UPLOAD_PATHS = {"/transactions/upload", "/portfolio/upload"}


def copy_upload(source: BinaryIO, destination: BinaryIO) -> None:
    """Copy in bounded chunks, rejecting oversized files even without a header."""
    size = 0
    while chunk := source.read(UPLOAD_CHUNK_BYTES):
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Upload exceeds 20 MiB limit")
        destination.write(chunk)


class UploadSizeMiddleware:
    """Bound upload bodies before and during multipart parsing."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] == "http"
            and scope["method"] == "POST"
            and scope["path"].rstrip("/") in UPLOAD_PATHS
        ):
            length = Headers(scope=scope).get("content-length")
            if length is not None:
                try:
                    size = int(length)
                    if size < 0:
                        raise ValueError
                except ValueError:
                    response = JSONResponse({"detail": "Invalid Content-Length"}, 400)
                    await response(scope, receive, send)
                    return
                if size > MAX_UPLOAD_REQUEST_BYTES:
                    response = JSONResponse(
                        {"detail": "Upload request exceeds size limit"}, 413
                    )
                    await response(scope, receive, send)
                    return
            received = 0
            too_large = False

            async def limited_receive() -> Message:
                nonlocal received, too_large
                message = await receive()
                if message["type"] == "http.request":
                    received += len(message.get("body", b""))
                    if received > MAX_UPLOAD_REQUEST_BYTES:
                        too_large = True
                        # The multipart parser closes its temporary files on this error.
                        raise MultiPartException("Upload request exceeds size limit")
                return message

            async def limited_send(message: Message) -> None:
                # Starlette converts multipart errors to 400; size errors are 413.
                if too_large and message["type"] == "http.response.start":
                    message = {**message, "status": 413}
                await send(message)

            await self.app(scope, limited_receive, limited_send)
            return
        await self.app(scope, receive, send)
