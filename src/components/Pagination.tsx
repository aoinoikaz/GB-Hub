import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  className?: string;
  showPageNumbers?: boolean;
  maxButtonsToShow?: number;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false,
  className = '',
  showPageNumbers = true,
  maxButtonsToShow = 5,
}) => {
  // Check if we're on mobile
  const isMobile = window.matchMedia("(max-width: 640px)").matches;

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];

    if (!showPageNumbers || isMobile) {
      return [];
    }

    if (totalPages <= maxButtonsToShow) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      const maxMainRange = maxButtonsToShow - 2;
      const half = Math.floor(maxMainRange / 2);
      let leftBound = Math.max(2, currentPage - half);
      let rightBound = Math.min(totalPages - 1, currentPage + half);

      const currentRangeSize = rightBound - leftBound + 1;
      if (currentRangeSize > maxMainRange) {
        if (currentPage <= half + 1) {
          rightBound = leftBound + maxMainRange - 1;
        } else if (currentPage >= totalPages - half) {
          leftBound = rightBound - maxMainRange + 1;
        } else {
          leftBound = currentPage - Math.floor(maxMainRange / 2);
          rightBound = leftBound + maxMainRange - 1;
        }
      } else if (currentRangeSize < maxMainRange) {
        if (currentPage <= half + 1) {
          rightBound = Math.min(totalPages - 1, leftBound + maxMainRange - 1);
        } else if (currentPage >= totalPages - half) {
          leftBound = Math.max(2, rightBound - maxMainRange + 1);
        }
      }

      pages.push(1);
      if (leftBound > 2) {
        pages.push("...");
      } else if (leftBound === 2) {
        pages.push(2);
        leftBound = 3;
      }

      for (let i = leftBound; i <= rightBound; i++) {
        pages.push(i);
      }

      if (rightBound < totalPages - 1) {
        pages.push("...");
        pages.push(totalPages);
      } else if (rightBound === totalPages - 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  if (totalPages <= 1) return null;

  return (
    <div className={`flex flex-col items-center space-y-4 ${className}`}>
      <div className="flex justify-between items-center w-full sm:w-auto sm:space-x-2">
        <button
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage === 1 || isLoading}
          className={`py-2 px-6 rounded-lg text-white sm:px-4 sm:py-1 sm:text-sm transition ${
            currentPage === 1 || isLoading
              ? "bg-gray-500 cursor-not-allowed"
              : "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
          }`}
        >
          Back
        </button>

        {isMobile || !showPageNumbers ? (
          <span className="text-gray-200 text-sm py-1">
            Page {currentPage} of {totalPages}
          </span>
        ) : (
          <div className="flex space-x-2">
            {getPageNumbers().map((page, index) => (
              <button
                key={index}
                onClick={() => {
                  if (typeof page === "number") {
                    onPageChange(page);
                  }
                }}
                className={`py-2 px-4 rounded-lg sm:px-3 sm:text-sm transition ${
                  typeof page === "number" && page === currentPage
                    ? "bg-purple-500 text-white"
                    : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                } ${typeof page === "string" ? "cursor-default" : ""}`}
                disabled={typeof page === "string" || isLoading}
              >
                {page}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          disabled={currentPage === totalPages || isLoading}
          className={`py-2 px-6 rounded-lg text-white sm:px-4 sm:py-1 sm:text-sm transition ${
            currentPage === totalPages || isLoading
              ? "bg-gray-500 cursor-not-allowed"
              : "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Pagination;