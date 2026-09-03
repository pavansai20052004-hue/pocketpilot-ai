param([string]$OutputDirectory = $PSScriptRoot)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-ErrorFixture {
    param(
        [string]$Name,
        [string[]]$Lines,
        [System.Drawing.Color]$Background,
        [System.Drawing.Color]$Foreground,
        [single]$Angle = 0
    )

    $width = 1600
    $height = 960
    $bitmap = [System.Drawing.Bitmap]::new($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $graphics.Clear($Background)
    $font = [System.Drawing.Font]::new('Consolas', 34, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = [System.Drawing.SolidBrush]::new($Foreground)
    try {
        if ($Angle -ne 0) {
            $graphics.TranslateTransform($width / 2, $height / 2)
            $graphics.RotateTransform($Angle)
            $graphics.TranslateTransform(-$width / 2, -$height / 2)
        }
        $y = 150
        foreach ($line in $Lines) {
            $graphics.DrawString($line, $font, $brush, 120, $y)
            $y += 62
        }
        $target = Join-Path $OutputDirectory "$Name.png"
        $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $brush.Dispose()
        $font.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

$dark = [System.Drawing.Color]::FromArgb(10, 14, 12)
$light = [System.Drawing.Color]::FromArgb(230, 238, 225)

New-ErrorFixture -Name 'python-traceback-clear' -Lines @(
    'Traceback (most recent call last):',
    '  File "user_service.py", line 18, in get_user_name',
    '    return users[user_id]["name"]',
    'KeyError: 42'
) -Background $dark -Foreground $light

New-ErrorFixture -Name 'java-exception-clear' -Lines @(
    'java.lang.NullPointerException: user was null',
    '  at demo.UserService.displayName(UserService.java:12)',
    '  at demo.Main.main(Main.java:7)'
) -Background $dark -Foreground $light

New-ErrorFixture -Name 'typescript-error-clear' -Lines @(
    'TypeError: Cannot read properties of undefined (reading name)',
    '  at getUserName (src/user.ts:42:17)',
    '  at main (src/index.ts:8:3)'
) -Background $dark -Foreground $light

New-ErrorFixture -Name 'python-traceback-low-contrast' -Lines @(
    'Traceback (most recent call last):',
    '  File "user_service.py", line 18, in get_user_name',
    'KeyError: 42'
) -Background ([System.Drawing.Color]::FromArgb(60, 64, 61)) -Foreground ([System.Drawing.Color]::FromArgb(128, 133, 126))

New-ErrorFixture -Name 'java-exception-rotated' -Lines @(
    'java.lang.NullPointerException: user was null',
    '  at demo.UserService.displayName(UserService.java:12)',
    '  at demo.Main.main(Main.java:7)'
) -Background $dark -Foreground $light -Angle 7
