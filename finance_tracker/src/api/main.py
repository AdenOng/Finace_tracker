from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from finance_tracker.src.api.routers import auth, transactions, portfolio

app = FastAPI(title="Finance Tracker API")

# Configure CORS
origins = [
    "http://localhost:5173",  # Vite default port
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(transactions.router)
app.include_router(portfolio.router)

@app.get("/")
async def root():
    return {"message": "Finance Tracker API is running"}
