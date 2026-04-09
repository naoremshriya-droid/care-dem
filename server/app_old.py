from fastapi import FastAPI
import uvicorn


app = FastAPI()

def main():
    uvicorn.run(app, host="0.0.0.0", port=7860)

if __name__ == "__main__":
    main()
