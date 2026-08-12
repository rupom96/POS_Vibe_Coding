using System.Security.Cryptography;
using System.Text;

namespace PosApi.Security;

// Port of BR2's BR_Utility.Encription.DBZEncription (DES/CBC).
// SecurityUser.Password is stored encrypted; the last 2 chars encode the key index.
// BR2 login validates by DECRYPTING the stored value and comparing to the raw input,
// because encryption is non-deterministic (random key index each time).
public static class DbzEncryption
{
    private static readonly byte[] IV = { 0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef };

    // Order MUST match BR2's DBZEncription.GenerateKey exactly — index = last 2 chars of ciphertext.
    private static readonly string[] GenerateKey =
    {
        "HNJLXDBZ", "DBZFWEKF", "YD9CNDBZ", "DBZKN6YR", "VNYUCDBZ", "DBZXQKUY", "ENZBEDBZ", "DBZ2YFHP", "RFCE3DBZ", "DBZS3IQ8",
        "YIJ0EDBZ", "DBZNDZEF", "4JRNHDBZ", "DBZOXZDT", "JZALGDBZ", "DBZSAKZT", "M4Z2KDBZ", "DBZFIYII", "SPUWADBZ", "DBZOSSUC",
        "LPPEIDBZ", "DBZS3M1N", "6GO1KDBZ", "DBZCMWWZ", "3UCYJDBZ"
    };

    public static string? Decrypt(string? stringToDecrypt)
    {
        if (string.IsNullOrEmpty(stringToDecrypt) || stringToDecrypt.Length < 3)
            return null;

        try
        {
            if (!int.TryParse(stringToDecrypt[^2..], out var keyIndex)
                || keyIndex < 0 || keyIndex >= GenerateKey.Length)
                return null;

            var payload = stringToDecrypt[..^2];
            var key = Encoding.UTF8.GetBytes(GenerateKey[keyIndex]);
            var input = Convert.FromBase64String(payload);

            using var des = DES.Create();
            des.Mode = CipherMode.CBC;
            des.Padding = PaddingMode.PKCS7;
            using var decryptor = des.CreateDecryptor(key, IV);
            var output = decryptor.TransformFinalBlock(input, 0, input.Length);
            return Encoding.UTF8.GetString(output);
        }
        catch
        {
            return null;
        }
    }
}
