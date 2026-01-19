"""
Supabase Storage service for uploading podcast audio files.
"""
from typing import Optional
from loguru import logger
from supabase import create_client, Client

from app.core.config import settings


class StorageService:
    """
    Handles file uploads to Supabase Storage.
    
    Uses the service role key for server-side uploads.
    """
    
    BUCKET_NAME = "podcast-audio"
    
    def __init__(self):
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment"
            )
        
        self.client: Client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
    
    def upload_audio(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str = "audio/mpeg"
    ) -> str:
        """
        Upload audio file to Supabase Storage.
        
        Args:
            file_bytes: The audio file content as bytes
            filename: Name for the file (e.g., "podcast_1_2026-01-18.mp3")
            content_type: MIME type of the file
            
        Returns:
            Public URL of the uploaded file
        """
        logger.info(f"Uploading {filename} to Supabase Storage ({len(file_bytes)} bytes)")
        
        try:
            # Upload to storage
            result = self.client.storage.from_(self.BUCKET_NAME).upload(
                path=filename,
                file=file_bytes,
                file_options={"content-type": content_type}
            )
            
            # Get public URL
            public_url = self.client.storage.from_(self.BUCKET_NAME).get_public_url(filename)
            
            logger.info(f"Uploaded successfully: {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"Failed to upload {filename}: {e}")
            raise
    
    def delete_audio(self, filename: str) -> bool:
        """
        Delete an audio file from Supabase Storage.
        
        Args:
            filename: Name of the file to delete
            
        Returns:
            True if deleted successfully
        """
        try:
            self.client.storage.from_(self.BUCKET_NAME).remove([filename])
            logger.info(f"Deleted {filename} from storage")
            return True
        except Exception as e:
            logger.error(f"Failed to delete {filename}: {e}")
            return False
