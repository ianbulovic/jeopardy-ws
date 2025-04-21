# jeopardy-ws
A websocket-based jeopardy game to play with friends on your local network.
Host interface is designed for desktop/laptop, and player interface is designed for mobile.

## How to use

### With [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
uv run server.py
```

### With conda/pip

```bash
# optionally create a conda environment
conda create -n jeopardy python=3.12 && conda activate jeopardy

# install dependencies and run
pip install -r requirements.txt
python server.py
```
