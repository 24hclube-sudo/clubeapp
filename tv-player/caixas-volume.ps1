# Volume da saida padrao do Windows, para a barra do app. Fica aberto e atende uma linha por vez:
#   get        -> {"volume":0.86,"mudo":false,"saida":"Alto-falantes"}
#   set 0.50   -> muda o volume, tira o mudo e responde igual
# Quem abre e fecha este processo e o caixas.js. Sempre a saida padrao do momento, nunca uma fixa.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class EnumeradorCo {}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IEnumerador {
  void EnumAudioEndpoints(int fluxo, int mascara, out IntPtr colecao);
  void GetDefaultAudioEndpoint(int fluxo, int papel, out IDispositivo d);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDispositivo {
  void Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  void OpenPropertyStore(int acesso, out IPropriedades s);
}
[StructLayout(LayoutKind.Sequential)] struct CHAVE { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Explicit)] struct VALOR { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr resto; }
[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropriedades {
  void GetCount(out int c);
  void GetAt(int i, out CHAVE k);
  void GetValue(ref CHAVE k, out VALOR v);
}
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IVolumeSaida {
  void RegisterControlChangeNotify(IntPtr p);
  void UnregisterControlChangeNotify(IntPtr p);
  void GetChannelCount(out uint n);
  void SetMasterVolumeLevel(float db, ref Guid g);
  void SetMasterVolumeLevelScalar(float v, ref Guid g);
  void GetMasterVolumeLevel(out float db);
  void GetMasterVolumeLevelScalar(out float v);
  void SetChannelVolumeLevel(uint c, float db, ref Guid g);
  void SetChannelVolumeLevelScalar(uint c, float v, ref Guid g);
  void GetChannelVolumeLevel(uint c, out float db);
  void GetChannelVolumeLevelScalar(uint c, out float v);
  void SetMute(int m, ref Guid g);
  void GetMute(out int m);
}

public class EstadoCaixas { public float Volume; public bool Mudo; public string Saida; }

public static class Caixas {
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref VALOR v);

  static string Nome(IDispositivo d) {
    IPropriedades ps; d.OpenPropertyStore(0, out ps);
    var k = new CHAVE { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
    VALOR v; ps.GetValue(ref k, out v);
    string nome = v.p == IntPtr.Zero ? "" : Marshal.PtrToStringUni(v.p);
    PropVariantClear(ref v);
    Marshal.ReleaseComObject(ps);
    return nome;
  }

  // novo < 0: so le.
  public static EstadoCaixas Usar(float novo) {
    var en = (IEnumerador)new EnumeradorCo();
    IDispositivo d = null;
    IVolumeSaida vol = null;
    try {
      en.GetDefaultAudioEndpoint(0, 1, out d);
      Guid iid = typeof(IVolumeSaida).GUID;
      object o; d.Activate(ref iid, 23, IntPtr.Zero, out o);
      vol = (IVolumeSaida)o;
      if (novo >= 0) {
        Guid g = Guid.Empty;
        vol.SetMasterVolumeLevelScalar(novo, ref g);
        // Mudo ligado faria a barra andar sem mudar o som.
        if (novo > 0) vol.SetMute(0, ref g);
      }
      float v; int m;
      vol.GetMasterVolumeLevelScalar(out v);
      vol.GetMute(out m);
      return new EstadoCaixas { Volume = v, Mudo = m != 0, Saida = Nome(d) };
    } finally {
      if (vol != null) Marshal.ReleaseComObject(vol);
      if (d != null) Marshal.ReleaseComObject(d);
      Marshal.ReleaseComObject(en);
    }
  }
}
'@

$cultura = [Globalization.CultureInfo]::InvariantCulture
while ($null -ne ($linha = [Console]::In.ReadLine())) {
  try {
    $partes = $linha.Trim([char]0xFEFF, ' ', [char]9) -split '\s+'
    $novo = -1.0
    if ($partes[0] -eq 'set') {
      $novo = [double]::Parse($partes[1], $cultura)
      if ($novo -lt 0 -or $novo -gt 1) { throw 'volume fora de 0 a 1' }
    } elseif ($partes[0] -ne 'get') {
      throw 'comando desconhecido'
    }
    $r = [Caixas]::Usar([single]$novo)
    $saida = @{ volume = [math]::Round([double]$r.Volume, 3); mudo = $r.Mudo; saida = $r.Saida } | ConvertTo-Json -Compress
  } catch {
    $saida = @{ erro = $_.Exception.Message } | ConvertTo-Json -Compress
  }
  [Console]::Out.WriteLine($saida)
  [Console]::Out.Flush()
}
