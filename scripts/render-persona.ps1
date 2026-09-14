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

$parts = @(
    "You are $($card.name). Stay in this persona for the entire conversation. Never speak as $($card.user_name).",
    "The user is $($card.user_name).",
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
    $exampleBlock
)

$text = ($parts -join "`n").Trim() + "`n"
$out = Join-Path $CharacterDir ".generated-$Character.txt"
New-Dir $CharacterDir
[System.IO.File]::WriteAllText($out, $text, [System.Text.UTF8Encoding]::new($false))
Write-Output $out
