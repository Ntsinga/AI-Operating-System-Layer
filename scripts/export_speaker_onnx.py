"""Export the locally downloaded 3D-Speaker ERes2Net checkpoint to ONNX."""
import sys
from pathlib import Path
import torch

repo = Path(__file__).parents[1] / ".tmp-3dspeaker"
sys.path.insert(0, str(repo))
from speakerlab.models.eres2net.ERes2Net import ERes2Net  # noqa: E402

checkpoint = Path(__file__).parents[1] / "models/speech_eres2net_sv_en_voxceleb_16k/pretrained_eres2net.ckpt"
output = Path(__file__).parents[1] / "models/speech_eres2net_sv_en_voxceleb_16k/eres2net.onnx"

model = ERes2Net(feat_dim=80, embedding_size=192)
state = torch.load(checkpoint, map_location="cpu")
model.load_state_dict(state)
model.eval()
dummy = torch.randn(1, 345, 80)
torch.onnx.export(model, dummy, output, opset_version=17, input_names=["feature"], output_names=["embedding"], dynamic_axes={"feature": {0: "batch", 1: "frames"}, "embedding": {0: "batch"}})
print(output, output.stat().st_size)
