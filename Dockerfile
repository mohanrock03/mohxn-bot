# Use official Python image
FROM python:3.9

# Set working directory
WORKDIR /code

# Copy requirements and install
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy all files
COPY . .

# Set permissions for Hugging Face
RUN chmod -R 777 /code

# Start the application
# Hugging Face Spaces uses port 7860 by default
CMD ["uvicorn", "backend:app", "--host", "0.0.0.0", "--port", "7860"]
