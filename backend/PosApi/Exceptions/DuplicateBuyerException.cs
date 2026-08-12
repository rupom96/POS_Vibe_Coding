namespace PosApi.Exceptions;

public sealed class DuplicateBuyerException : Exception
{
    public DuplicateBuyerException()
        : base("A customer with this mobile number already exists.")
    {
    }

    public DuplicateBuyerException(string message)
        : base(message)
    {
    }
}
