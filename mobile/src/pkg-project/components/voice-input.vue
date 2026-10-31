<template>
  <view class="voice-input-wrapper">
    <!-- 语音按钮 -->
    <view class="voice-btn" :class="{ recording: isRecording, 'has-text': hasText }" @click="toggleRecording">
      <!-- 停止/开始图标 -->
      <view v-if="isRecording" class="mic-icon">
        <view class="mic-dot"></view>
      </view>
      <text v-else class="mic-icon">🎙️</text>
    </view>

    <!-- AI整理按钮（识别完成后出现） -->
    <view v-if="hasText && !isRecording" class="ai-btn" @click="emit('ai-organize', transcribedText)">
      <text>✨ 整理</text>
    </view>

    <!-- 录音状态指示 -->
    <view v-if="isRecording" class="recording-indicator">
      <view class="wave-bar" v-for="i in 5" :key="i" :style="{ animationDelay: (i * 0.1) + 's' }"></view>
    </view>

    <!-- 实时转写文字预览（识别进行中） -->
    <view v-if="isRecording && interimText" class="interim-preview">
      {{ interimText }}
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
  modelValue: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:modelValue", "ai-organize"]);

const isRecording = ref(false);
const interimText = ref("");
const transcribedText = ref(props.modelValue || "");

// 判断是否已有识别文字
const hasText = computed(() => !!transcribedText.value);

// Web Speech API 识别器
let recognition = null;

const initRecognition = () => {
  // #ifdef H5
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    uni.showToast({ title: "当前浏览器不支持语音识别", icon: "none" });
    return null;
  }
  const rec = new SpeechRecognition();
  rec.lang = "zh-CN"; // 普通话
  rec.continuous = true; // 持续识别
  rec.interimResults = true; // 返回临时结果

  rec.onstart = () => {
    isRecording.value = true;
    interimText.value = "";
  };

  rec.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }
    interimText.value = interim;
    if (final) {
      transcribedText.value = (transcribedText.value + final).trim();
      emit("update:modelValue", transcribedText.value);
    }
  };

  rec.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    isRecording.value = false;
    if (event.error !== "no-speech") {
      uni.showToast({ title: "语音识别出错", icon: "none" });
    }
  };

  rec.onend = () => {
    isRecording.value = false;
    interimText.value = "";
    // 结束时把 interim 也合并进去
    if (interimText.value) {
      transcribedText.value = (transcribedText.value + interimText.value).trim();
      emit("update:modelValue", transcribedText.value);
    }
  };

  return rec;
  // #endif
  return null;
};

// 启动 / 停止录音
const toggleRecording = () => {
  if (isRecording.value) {
    stopRecording();
  } else {
    startRecording();
  }
};

const startRecording = () => {
  // #ifdef H5
  if (!recognition) {
    recognition = initRecognition();
  }
  if (!recognition) return;

  // 清空之前的结果（每次开始都说新的）
  interimText.value = "";

  try {
    recognition.start();
  } catch (e) {
    // 已经在运行就先停止再开始
    recognition.stop();
    setTimeout(() => recognition.start(), 100);
  }
  // #endif

  // #ifndef H5
  // APP 端暂时提示暂不支持
  uni.showToast({ title: "APP端语音功能开发中", icon: "none" });
  // #endif
};

const stopRecording = () => {
  // #ifdef H5
  if (recognition) {
    recognition.stop();
  }
  // #endif
  isRecording.value = false;
};

// 监听 modelValue 外部变化（支持清空等操作）
watch(
  () => props.modelValue,
  (val) => {
    transcribedText.value = val || "";
  }
);
</script>

<style scoped>
.voice-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

/* 麦克风按钮 */
.voice-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.voice-btn:active {
  transform: scale(0.95);
}

.voice-btn.recording {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
  box-shadow: 0 4px 16px rgba(255, 107, 107, 0.5);
  animation: pulse-ring 1.5s ease-in-out infinite;
}

.voice-btn.has-text .mic-icon {
  font-size: 18px;
}

.mic-icon {
  font-size: 20px;
  line-height: 1;
}

.mic-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
}

/* 录音时的脉冲动画 */
@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.6);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(255, 107, 107, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 107, 107, 0);
  }
}

/* AI整理按钮 */
.ai-btn {
  padding: 6px 12px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: #fff;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(245, 87, 108, 0.3);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.ai-btn:active {
  opacity: 0.85;
}

/* 录音波形指示器 */
.recording-indicator {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 20px;
}

.wave-bar {
  width: 3px;
  height: 100%;
  background: #667eea;
  border-radius: 2px;
  animation: wave 0.6s ease-in-out infinite alternate;
}

@keyframes wave {
  0% {
    transform: scaleY(0.3);
  }
  100% {
    transform: scaleY(1);
  }
}

/* 实时转写预览 */
.interim-preview {
  flex: 1;
  font-size: 13px;
  color: #667eea;
  background: rgba(102, 126, 234, 0.08);
  padding: 6px 10px;
  border-radius: 8px;
  min-height: 36px;
  display: flex;
  align-items: center;
  overflow: hidden;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
