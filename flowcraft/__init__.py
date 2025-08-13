"""flowcraft package.

provides an app factory to embed or run the flowcraft ui and api.
"""

from .app_factory import create_app  # noqa: F401

__all__ = ["create_app"]


