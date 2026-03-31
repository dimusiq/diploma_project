# Запуск vLLM (OpenAI API) для nebardak. См. vllm-serve-nebardak.sh для комментариев.
# Пример: .\scripts\vllm-serve-nebardak.ps1
# Доп. флаги vLLM: .\scripts\vllm-serve-nebardak.ps1 -- --dtype auto
# Требуется vLLM >= 0.8.5 и `vllm` в PATH.

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$Model = if ($env:VLLM_MODEL) { $env:VLLM_MODEL } else { "Qwen/Qwen3-8B-AWQ" }
$Port = if ($env:VLLM_PORT) { $env:VLLM_PORT } else { "8001" }
$HostBind = if ($env:VLLM_HOST) { $env:VLLM_HOST } else { "0.0.0.0" }
$MaxLen = if ($env:VLLM_MAX_MODEL_LEN) { $env:VLLM_MAX_MODEL_LEN } else { "1536" }
$GpuMem = if ($env:VLLM_GPU_MEMORY_UTILIZATION) { $env:VLLM_GPU_MEMORY_UTILIZATION } else { "0.92" }

$enforce = if ($null -ne $env:VLLM_ENFORCE_EAGER -and $env:VLLM_ENFORCE_EAGER -eq "0") { $false } else { $true }

$vllmArgs = @(
    "serve", $Model,
    "--host", $HostBind,
    "--port", $Port,
    "--trust-remote-code",
    "--gpu-memory-utilization", $GpuMem,
    "--max-model-len", $MaxLen,
    "--enable-auto-tool-choice",
    "--tool-call-parser", "hermes",
    "--reasoning-parser", "deepseek_r1",
    "--disable-log-stats"
)
if ($enforce) { $vllmArgs += "--enforce-eager" }
if ($ExtraArgs -and $ExtraArgs.Length -gt 0) { $vllmArgs += $ExtraArgs }

& vllm @vllmArgs
