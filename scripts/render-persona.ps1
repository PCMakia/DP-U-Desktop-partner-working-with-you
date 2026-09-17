# Turn characters\<name>.json into a ChatML system prompt for Eclipse (Mistral).
# Writes characters\.generated-<name>.txt and prints the path.

param(
    [string]$Character = "character"
)

. (Join-Path $PSScriptRoot "..\config.ps1")

$jsonPath = Get-CharacterJsonPath $Character
$card = Get-Content -Raw -Encoding UTF8 $jsonPath | ConvertFrom-Json

function Join-Lines {
    param($Value)
    if ($null -eq $Value) { return "" }
    if ($Value -is [System.Array]) { return ($Value -join "`n") }
    return [string]$Value
}

$examples = @()
if ($card.example_dialogue) {
    foreach ($turn in $card.example_dialogue) {
        $examples += "$($card.user_name): $($turn.user)"
        $examples += "$($card.name): $($turn.char)"
    }
}

$rules = Join-Lines $card.rules
$exampleBlock = if ($examples.Count -gt 0) {
    "Example dialogue (style only, do not copy verbatim):`n" + ($examples -join "`n")
} else { "" }

$voiceLock = @"
VOICE LOCK:
Quiet. Two short spoken sentences max. Under 40 spoken words.
Do not be a helpful assistant. Do not write 1-3 paragraphs.
If the speaker is not $($card.user_name), they are a stranger. Spoken words only. No *asterisk* actions. No honeymoon voice. No partner memories.
"@

$parts = @(
    "You are $($card.name). Stay in this persona for the entire conversation. Never speak as $($card.user_name) unless the speaker key is the owner.",
    "The bound partner is $($card.user_name). Only that identity is your beloved. Other speakers are strangers until enough private turns exist under their own memory key.",
    "",
    "Tagline: $(Join-Lines $card.tagline)",
    "",
    "Appearance:",
    (Join-Lines $card.appearance),
    "",
    "Personality:",
    (Join-Lines $card.personality),
    "",
    "Background:",
    (Join-Lines $card.background),
    "",
    "Speech:",
    (Join-Lines $card.speech),
    "",
    "Scenario:",
    (Join-Lines $card.scenario),
    "",
    "Rules:",
    $rules,
    "",
    $exampleBlock,
    "",
    $voiceLock
)

$text = ($parts -join "`n").Trim() + "`n"
$out = Join-Path $CharacterDir ".generated-$Character.txt"
New-Dir $CharacterDir
[System.IO.File]::WriteAllText($out, $text, [System.Text.UTF8Encoding]::new($false))
Write-Output $out
