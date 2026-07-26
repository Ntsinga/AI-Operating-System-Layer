---
tasks:
- speaker-verification
model_type:
- ERes2Net
domain:
- audio
frameworks:
- pytorch
backbone:
- ERes2Net
license: Apache License 2.0
language:
- en
tags:
- ERes2Net
- INTERSPEECH 2023
widgets:
  - task: speaker-verification
    model_revision: v1.0.3
    inputs:
      - type: audio
        name: input
        title: 音频
    extendsParameters:
      thr: 0.356
    examples:
      - name: 1
        title: 示例1
        inputs:
          - name: enroll
            data: git://examples/speaker1_a_en_16k.wav
          - name: input
            data: git://examples/speaker1_b_en_16k.wav
      - name: 2
        title: 示例2
        inputs:
          - name: enroll
            data: git://examples/speaker1_a_en_16k.wav
          - name: input
            data: git://examples/speaker2_a_en_16k.wav
    inferencespec:
      cpu: 8 #CPU数量
      memory: 1024
---

# ERes2Net 说话人识别模型
ERes2Net模型是在Res2Net的基础上，对全局和局部特征进一步融合，从而提高说话人识别性能。局部特征融合将一个单一残差块内的特征融合提取局部信号；全局特征融合使用不同层级输出的不同尺度声学特征聚合全局信号；为了实现有效的特征融合，ERes2Net架构中采用了注意力特征融合模块。
## 模型简述
ERes2Net局部融合如下图黄色部分所示，使用Attentianal feature fusion阶梯式融合各分组特征来增强局部信息连接，获取更细粒度特征；全局融合如下图绿色部分所示，通过自底向上的全局特征融合来增强说话人信息。

<div align=center>
<img src="ERes2Net_architecture.png" width="700" />
</div>

## 训练数据
本模型使用公开的英文说话人数据集VoxCeleb2开发集进行训练，共计5994个说话人，可以对16k采样率的英文音频进行说话人识别。
## 模型效果评估
- 选择EER、minDCF作为客观评价指标。
- 在VoxCeleb1-O测试集上，EER = 0.83%，minDCF(p_target=0.01, c_miss=c_fa=1) = 0.072。

# 如何快速体验模型效果
## 在线体验
在页面右侧，可以在“在线体验”栏内看到我们预先准备好的示例音频，点击播放按钮可以试听，点击“执行测试”按钮，会在下方“测试结果”栏中显示相似度得分(范围为[-1,1])和是否判断为同一个人。如果您想要测试自己的音频，可点“更换音频”按钮，选择上传或录制一段音频，完成后点击执行测试，识别内容将会在测试结果栏中显示。
## 在Notebook中体验
```python
from modelscope.pipelines import pipeline
sv_pipline = pipeline(
    task='speaker-verification',
    model='damo/speech_eres2net_sv_en_voxceleb_16k'
)
speaker1_a_wav = 'https://modelscope.cn/api/v1/models/damo/speech_ecapa-tdnn_sv_en_voxceleb_16k/repo?Revision=master&FilePath=examples/speaker1_a_en_16k.wav'
speaker1_b_wav = 'https://modelscope.cn/api/v1/models/damo/speech_ecapa-tdnn_sv_en_voxceleb_16k/repo?Revision=master&FilePath=examples/speaker1_b_en_16k.wav'
speaker2_a_wav = 'https://modelscope.cn/api/v1/models/damo/speech_ecapa-tdnn_sv_en_voxceleb_16k/repo?Revision=master&FilePath=examples/speaker2_a_en_16k.wav'
# 相同说话人语音
result = sv_pipline([speaker1_a_wav, speaker1_b_wav])
print(result)
# 不同说话人语音
result = sv_pipline([speaker1_a_wav, speaker2_a_wav])
print(result)
# 可以自定义得分阈值来进行识别
result = sv_pipline([speaker1_a_wav, speaker2_a_wav], thr=0.356)
print(result)
```
## 训练和测试自己的ERes2Net模型
本项目已在[3D-Speaker](https://github.com/alibaba-damo-academy/3D-Speaker)开源了训练、测试和推理代码，使用者可按下面方式下载安装使用：
``` sh
git clone https://github.com/alibaba-damo-academy/3D-Speaker.git && cd 3D-Speaker
conda create -n 3D-Speaker python=3.8
conda activate 3D-Speaker
pip install -r requirements.txt
```

运行ERes2Net在VoxCeleb集上的训练脚本
``` sh
cd egs/sv-eres2net/voxceleb
# 需要在run.sh中提前配置训练使用的GPU信息，默认是8卡
bash run.sh
```

# 相关论文以及引用信息
如果你觉得这个该模型有所帮助，请引用下面的相关的论文
```BibTeX
@article{eres2net,
  title={An Enhanced Res2Net with Local and Global Feature Fusion for Speaker Verification},
  author={Yafeng Chen, Siqi Zheng, Hui Wang, Luyao Cheng, Qian Chen, Jiajun Qi},
  booktitle={Interspeech 2023},
  year={2023},
  organization={IEEE}
}
```

# 3D-Speaker 开发者社区钉钉群
<div align=left>
<img src="ding.png" width="300" />
</div>


