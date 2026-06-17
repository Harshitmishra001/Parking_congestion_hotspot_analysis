# Use official Python image
FROM python:3.9

# Set the working directory
WORKDIR /code

# Copy requirements and install
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy your API and CSV files into the container
COPY . /code

# Hugging Face exposes port 7860. We MUST bind uvicorn to 7860.
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "7860"]
